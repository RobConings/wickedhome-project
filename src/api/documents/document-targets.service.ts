import { createHash } from "node:crypto";
import {
  STORAGE_TARGETS,
  STORAGE_TARGET_KINDS,
  storageTargetOf,
  type StorageTargetKind,
} from "@/features/documents/types/documents";
import { startJobNow } from "../jobs/job-scheduler";
import { db, type Prisma } from "../lib/db";
import { storageProvider } from "./storage/storage";
import {
  FAILED_AFTER_ATTEMPTS,
  RETRY_BASE_MS,
  StorageTargetUnavailableError,
  isMoveDue,
  nextAttemptAt,
  storageTargetHandler,
  verifiedMove,
  type LocalDigest,
} from "./storage/storage-targets";

/*
 * Moving documents to their storage target (bills → a Google Drive folder, …). See storage/storage-targets.ts
 * for the handler and the safety rules. Everything here is Google-agnostic.
 */

export const MOVE_JOB_ID = "documents.move-to-targets";
/** A new upload waits at most this long for the target before it stays local (pending) and the job retries. */
const INLINE_MOVE_TIMEOUT_MS = 120_000;
/** While a target is paused (e.g. Google needs a reconnect), pending files are looked at again this often. */
const PAUSED_RETRY_MS = 3 * RETRY_BASE_MS;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300) || "Unknown error";
const asKind = (value: string | null): StorageTargetKind | null =>
  value && (STORAGE_TARGET_KINDS as string[]).includes(value) ? (value as StorageTargetKind) : null;

/** Active (uploaded, not trashed) files attached to an item of this kind. */
const filesOfKind = (householdId: string, kind: StorageTargetKind) =>
  ({
    householdId,
    deletedAt: null,
    uploadedAt: { not: null },
    links: { some: { entityType: { in: [...STORAGE_TARGETS[kind].entityTypes] } } },
  }) satisfies Prisma.DocumentFileWhereInput;

/** Starts the retry job now (in the background); one already running picks the new files up itself. */
function kickMoveJob() {
  try {
    startJobNow(MOVE_JOB_ID);
  } catch {
    // Already running (it loops until nothing is due) or not registered in this process (tests).
  }
}

async function digestLocal(key: string): Promise<LocalDigest> {
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let sizeBytes = 0;
  for await (const chunk of await storageProvider("LOCAL").get(key)) {
    const bytes = chunk as Buffer;
    sizeBytes += bytes.length;
    sha256.update(bytes);
    md5.update(bytes);
  }
  return { sizeBytes, sha256: sha256.digest("hex"), md5: md5.digest("hex") };
}

async function clearPending(where: Prisma.DocumentFileWhereInput) {
  await db.documentFile.updateMany({
    where: { ...where, pendingTarget: { not: null } },
    data: { pendingTarget: null, targetAttempts: 0, targetNextAttemptAt: null, targetError: null },
  });
}

/** Leaves the file local and pending; a real failure counts as an attempt (backoff), a paused target doesn't. */
async function recordFailure(fileId: string, kind: StorageTargetKind, error: unknown, now = new Date()) {
  const paused = error instanceof StorageTargetUnavailableError;
  const row = await db.documentFile.findUnique({ where: { id: fileId }, select: { targetAttempts: true, storageProvider: true } });
  if (!row || row.storageProvider !== "LOCAL") return;
  const attempts = paused ? row.targetAttempts : row.targetAttempts + 1;
  await db.documentFile.update({
    where: { id: fileId },
    data: {
      pendingTarget: kind,
      targetAttempts: attempts,
      targetNextAttemptAt: paused ? new Date(now.getTime() + PAUSED_RETRY_MS) : nextAttemptAt(attempts, now),
      targetError: errorText(error),
    },
  });
}

/**
 * Moves one local file to its storage target: upload, verify, re-point, and only then delete the local copy.
 * `moved`; `gone` (deleted or moved meanwhile); `skipped` (no target any more: it stays local, not pending).
 * Throws when the target is paused or the upload/verification failed; the caller records the failure.
 */
export async function moveFileToTarget(fileId: string, signal?: AbortSignal): Promise<"moved" | "gone" | "skipped"> {
  const file = await db.documentFile.findFirst({
    where: { id: fileId, storageProvider: "LOCAL", uploadedAt: { not: null }, storageKey: { not: null } },
    include: { links: { select: { entityType: true } } },
  });
  if (!file?.storageKey || !file.uploadedAt) return "gone";
  const handler = storageTargetHandler();
  const kind = asKind(file.pendingTarget) ?? storageTargetOf(file.links.map((link) => link.entityType));
  const state = handler && kind ? await handler.state(file.householdId, kind) : "off";
  if (!handler || !kind || state === "off") {
    await clearPending({ id: file.id });
    return "skipped";
  }
  if (state === "paused") throw new StorageTargetUnavailableError("The storage target is not available right now");

  const key = file.storageKey;
  const uploadedAt = file.uploadedAt;
  const local = storageProvider("LOCAL");
  const result = await verifiedMove({
    expectedSha256: file.sha256,
    digest: () => digestLocal(key),
    upload: () =>
      handler.upload(file.householdId, kind, { name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, uploadedAt, open: (range) => local.get(key, range) }, signal),
    // Guarded on the old key: a file deleted or moved meanwhile isn't overwritten (its copy is discarded).
    commit: async (copy) => {
      const { count } = await db.documentFile.updateMany({
        where: { id: file.id, storageProvider: "LOCAL", storageKey: key },
        data: {
          storageProvider: copy.provider,
          storageKey: copy.key,
          externalId: copy.externalId,
          pendingTarget: null,
          targetAttempts: 0,
          targetNextAttemptAt: null,
          targetError: null,
        },
      });
      return count === 1;
    },
    deleteLocal: () => local.delete(key),
    discard: (copy) => handler.discard(copy),
  });
  if (result === "moved") await handler.report?.(file.householdId, kind, null);
  return result;
}

/**
 * Right after a new upload was stored locally (`storeFileContent`): a file attached to an item of a target kind
 * (an expense attachment, a mail PDF) moves to its target now. When the target is unavailable it stays local,
 * marked pending, and the job retries; the upload itself never fails because of the target.
 */
export async function routeNewUpload(householdId: string, fileId: string): Promise<void> {
  const handler = storageTargetHandler();
  if (!handler) return;
  const links = await db.documentLink.findMany({ where: { fileId, householdId }, select: { entityType: true } });
  const kind = storageTargetOf(links.map((link) => link.entityType));
  if (!kind) return;
  const state = await handler.state(householdId, kind).catch(() => "paused" as const);
  if (state === "off") return;
  try {
    if (state === "paused") throw new StorageTargetUnavailableError("The storage target is not available right now");
    await moveFileToTarget(fileId, AbortSignal.timeout(INLINE_MOVE_TIMEOUT_MS));
  } catch (error) {
    console.warn(`[documents] moving a new upload to its storage target failed: ${errorText(error)}`);
    await recordFailure(fileId, kind, error);
    await handler.report?.(householdId, kind, errorText(error)).catch(() => undefined);
  }
}

/** After a local file was attached to an item: if that makes it a target kind's document, queue it to move. */
export async function queueAttachedFile(householdId: string, fileId: string, entityType: string): Promise<void> {
  const handler = storageTargetHandler();
  const kind = storageTargetOf([entityType]);
  if (!handler || !kind) return;
  if ((await handler.state(householdId, kind).catch(() => "off" as const)) === "off") return;
  const { count } = await db.documentFile.updateMany({
    where: { id: fileId, householdId, storageProvider: "LOCAL", uploadedAt: { not: null }, deletedAt: null, pendingTarget: null },
    data: { pendingTarget: kind, targetAttempts: 0, targetNextAttemptAt: null, targetError: null },
  });
  if (count > 0) kickMoveJob();
}

/**
 * "Move existing documents": queues every local file of this kind (and makes those already waiting due now).
 * The job does the work; returns how many files are queued.
 */
export async function queueExistingFiles(householdId: string, kind: StorageTargetKind): Promise<number> {
  const { count } = await db.documentFile.updateMany({
    where: { ...filesOfKind(householdId, kind), storageProvider: "LOCAL" },
    data: { pendingTarget: kind, targetAttempts: 0, targetNextAttemptAt: null, targetError: null },
  });
  if (count > 0) kickMoveJob();
  return count;
}

/** The target was turned off: nothing waits for it any more (files stay local; those already moved stay there). */
export async function forgetPendingFiles(householdId: string, kind: StorageTargetKind): Promise<void> {
  await clearPending({ householdId, pendingTarget: kind });
}

export type StorageTargetCounts = {
  /** Stored at the target (or another external provider). */
  inTarget: number;
  /** On the server and not queued. */
  local: number;
  /** Queued, still being retried normally. */
  pending: number;
  /** Queued, failed several times (still retried, less often). */
  failed: number;
  /** The most recent reason a move failed. */
  lastError: string | null;
};

export async function storageTargetCounts(householdId: string, kind: StorageTargetKind): Promise<StorageTargetCounts> {
  const base = filesOfKind(householdId, kind);
  const queued = { ...base, storageProvider: "LOCAL" as const, pendingTarget: kind };
  const [inTarget, local, pending, failed, latest] = await Promise.all([
    db.documentFile.count({ where: { ...base, storageProvider: { not: "LOCAL" } } }),
    db.documentFile.count({ where: { ...base, storageProvider: "LOCAL", pendingTarget: null } }),
    db.documentFile.count({ where: { ...queued, targetAttempts: { lt: FAILED_AFTER_ATTEMPTS } } }),
    db.documentFile.count({ where: { ...queued, targetAttempts: { gte: FAILED_AFTER_ATTEMPTS } } }),
    db.documentFile.findFirst({ where: { ...queued, targetError: { not: null } }, orderBy: { updatedAt: "desc" }, select: { targetError: true } }),
  ]);
  return { inTarget, local, pending, failed, lastError: latest?.targetError ?? null };
}

/**
 * The retry job (`documents.move-to-targets`, all households): moves every due pending file, oldest due
 * first, until nothing is due (files queued while it runs are picked up too) or `limit` files were tried.
 */
export async function processDueMoves({ signal, log, limit = 500 }: { signal?: AbortSignal; log?: (message: string) => void; limit?: number } = {}) {
  let moved = 0;
  let failed = 0;
  let skipped = 0;
  let waiting = 0;
  const tried = new Set<string>();
  while (tried.size < limit && !signal?.aborted) {
    const now = new Date();
    const rows = await db.documentFile.findMany({
      where: {
        pendingTarget: { not: null },
        storageProvider: "LOCAL",
        uploadedAt: { not: null },
        deletedAt: null,
        OR: [{ targetNextAttemptAt: null }, { targetNextAttemptAt: { lte: now } }],
        ...(tried.size > 0 && { id: { notIn: [...tried] } }),
      },
      select: { id: true, householdId: true, pendingTarget: true, targetNextAttemptAt: true, storageProvider: true, deletedAt: true, uploadedAt: true },
      orderBy: [{ targetNextAttemptAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: 25,
    });
    const due = rows.filter((row) => isMoveDue(row, now));
    if (due.length === 0) break;
    for (const row of due) {
      if (signal?.aborted || tried.size >= limit) break;
      tried.add(row.id);
      const kind = asKind(row.pendingTarget);
      try {
        const result = await moveFileToTarget(row.id, signal);
        if (result === "moved") moved += 1;
        else skipped += 1;
      } catch (error) {
        // A paused target (e.g. Google needs a reconnect) isn't a failed run: the card says what to do.
        if (error instanceof StorageTargetUnavailableError) waiting += 1;
        else {
          failed += 1;
          log?.(`A file could not be moved: ${errorText(error)}`);
        }
        if (kind) {
          await recordFailure(row.id, kind, error);
          await storageTargetHandler()?.report?.(row.householdId, kind, errorText(error)).catch(() => undefined);
        }
      }
    }
  }
  return { moved, failed, skipped, waiting };
}
