import { STORAGE_TARGET_KINDS, type StorageTargetKind } from "@/features/documents/types/documents";

/*
 * Storage keys of documents the app stored in someone's Drive as a storage target:
 *
 *   gdrive-target:<kind>:<userId>:<driveFileId>
 *
 * By user (not by connection, like linked files' `gdrive:<connectionId>:<fileId>`), so the files open again when
 * that person reconnects the same Google account (drive.file grants belong to the app + account, not to a
 * token). The kind tells which household setting ("Also remove from Drive") applies.
 */

const PREFIX = "gdrive-target:";
const KEY = /^gdrive-target:([a-z_]{1,40}):([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]{1,200})$/;

export const targetKey = (kind: StorageTargetKind, userId: string, fileId: string) => `${PREFIX}${kind}:${userId}:${fileId}`;

export function parseTargetKey(key: string): { kind: StorageTargetKind; userId: string; fileId: string } | null {
  const match = KEY.exec(key);
  if (!match?.[1] || !match[2] || !match[3] || !(STORAGE_TARGET_KINDS as string[]).includes(match[1])) return null;
  return { kind: match[1] as StorageTargetKind, userId: match[2], fileId: match[3] };
}

/** Prisma filter on `storageKey` for the target files stored in one person's Drive. */
export const targetKeyFilterForUser = (userId: string) => ({ startsWith: PREFIX, contains: `:${userId}:` });
