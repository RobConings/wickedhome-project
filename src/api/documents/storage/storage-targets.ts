import type { Readable } from "node:stream";
import type { StorageTargetKind } from "@/features/documents/types/documents";
import type { ByteRange, StorageProviderName } from "./storage-provider";

/*
 * Storage targets: a kind of document (e.g. "bills", see STORAGE_TARGETS in the contract) that the household
 * stores elsewhere than the server. The documents feature decides *which* files go and *when*, and owns the
 * safety rules (the local copy is deleted only after the remote copy is verified); the integration that
 * provides the target (Google Drive, src/api/integrations/drive-storage.service.ts) only uploads. It registers
 * itself with `setStorageTargetHandler`, so documents never depends on Google.
 */

/**
 * - `active`: move files there now.
 * - `paused`: configured, but not usable at the moment (Google needs a reconnect, a scope is missing): files
 *   stay local, marked pending, and the retry job moves them later.
 * - `off`: not configured, or deliberately stopped (the person disconnected Google): files simply stay local.
 */
export type StorageTargetState = "active" | "paused" | "off";

/** What the handler gets to upload: the document's metadata and its local bytes (ranges for resuming). */
export type TargetUpload = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** When it was uploaded to WickedHome (year subfolders). */
  uploadedAt: Date;
  open: (range?: ByteRange) => Promise<Readable>;
};

/** The remote copy as the target reports it after the upload, for verification. */
export type TargetCopy = {
  provider: Exclude<StorageProviderName, "LOCAL">;
  key: string;
  externalId: string;
  sizeBytes: number;
  /** Hex checksums the target computed itself (`null` when it doesn't give one). */
  sha256: string | null;
  md5: string | null;
};

export interface StorageTargetHandler {
  state(householdId: string, kind: StorageTargetKind): Promise<StorageTargetState>;
  upload(householdId: string, kind: StorageTargetKind, file: TargetUpload, signal?: AbortSignal): Promise<TargetCopy>;
  /** Removes a copy we made that failed verification or lost a race (never a file the person made). */
  discard(copy: TargetCopy): Promise<void>;
  /** Called after a move failed or succeeded, so the target can show its last problem. */
  report?(householdId: string, kind: StorageTargetKind, error: string | null): Promise<void>;
}

let handler: StorageTargetHandler | null = null;

/** Called once by the integration that provides storage targets. */
export function setStorageTargetHandler(next: StorageTargetHandler | null): void {
  handler = next;
}

export const storageTargetHandler = (): StorageTargetHandler | null => handler;

// ── Retry schedule (pure) ──────────────────────────────────────────────────────────────────────────

const MINUTE = 60_000;
/** First retry after 5 minutes, doubling, at most every 12 hours. Retries never stop by themselves. */
export const RETRY_BASE_MS = 5 * MINUTE;
export const RETRY_MAX_MS = 12 * 60 * MINUTE;
/** From this many failed attempts the UI calls it "failed" instead of "waiting" (it still retries). */
export const FAILED_AFTER_ATTEMPTS = 5;

/** When to try again after `attempts` failed attempts (1 = the first failure). */
export function nextAttemptAt(attempts: number, now = new Date()): Date {
  const delay = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
  return new Date(now.getTime() + delay);
}

export type PendingMove = {
  pendingTarget: string | null;
  targetNextAttemptAt: Date | null;
  storageProvider: StorageProviderName;
  deletedAt: Date | null;
  uploadedAt: Date | null;
};

/** Whether the retry job should try this file now: pending, still local, uploaded, not trashed, and due. */
export const isMoveDue = (file: PendingMove, now = new Date()) =>
  file.pendingTarget !== null &&
  file.storageProvider === "LOCAL" &&
  file.uploadedAt !== null &&
  file.deletedAt === null &&
  (file.targetNextAttemptAt === null || file.targetNextAttemptAt <= now);

// ── Verification (pure) ────────────────────────────────────────────────────────────────────────────

export type LocalDigest = { sizeBytes: number; sha256: string; md5: string };

/**
 * Whether the remote copy is byte-for-byte the local file: same size, and the target's own SHA-256 (or, when
 * it only gives one, MD5) equals ours. Without any checksum from the target it is *not* verified. `expected`
 * is the SHA-256 recorded at upload: a local file that changed since then is refused as well.
 */
export function verifyCopy(local: LocalDigest, copy: Pick<TargetCopy, "sizeBytes" | "sha256" | "md5">, expected: string | null): { ok: true } | { ok: false; reason: string } {
  if (expected && expected !== local.sha256) return { ok: false, reason: "The local file doesn't match its recorded checksum" };
  if (copy.sizeBytes !== local.sizeBytes) return { ok: false, reason: `Size differs in the target (${copy.sizeBytes} instead of ${local.sizeBytes} bytes)` };
  if (copy.sha256) {
    return copy.sha256.toLowerCase() === local.sha256 ? { ok: true } : { ok: false, reason: "SHA-256 differs in the target" };
  }
  if (copy.md5) return copy.md5.toLowerCase() === local.md5 ? { ok: true } : { ok: false, reason: "MD5 differs in the target" };
  return { ok: false, reason: "The target gave no checksum to verify the copy" };
}

export class StorageTargetUnavailableError extends Error {}

/**
 * The order of a move, which is what keeps it safe: digest the local file, upload, verify the remote copy,
 * point the row at it (`commit`, guarded: `false` when the row changed meanwhile), and only then delete the
 * local bytes. A copy that fails verification or loses the race is discarded; the local file always stays
 * unless the row points at a verified copy.
 */
export async function verifiedMove<Copy extends Pick<TargetCopy, "sizeBytes" | "sha256" | "md5">>(steps: {
  expectedSha256: string | null;
  digest: () => Promise<LocalDigest>;
  upload: () => Promise<Copy>;
  commit: (copy: Copy) => Promise<boolean>;
  deleteLocal: () => Promise<void>;
  discard: (copy: Copy) => Promise<void>;
}): Promise<"moved" | "gone"> {
  const local = await steps.digest();
  const copy = await steps.upload();
  const verdict = verifyCopy(local, copy, steps.expectedSha256);
  if (!verdict.ok) {
    await steps.discard(copy).catch(() => undefined);
    throw new Error(verdict.reason);
  }
  if (!(await steps.commit(copy))) {
    await steps.discard(copy).catch(() => undefined);
    return "gone";
  }
  await steps.deleteLocal();
  return "moved";
}
