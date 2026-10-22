import type { Readable } from "node:stream";
import { StorageNotFoundError, type ByteRange, type PutOptions, type StorageProvider, type StoredObject } from "./storage-provider";

/**
 * Access to Google Drive, provided by the integrations feature (src/api/integrations/google-drive.service.ts)
 * when it starts, so documents never depends on Google. Keys are `gdrive:<connectionId>:<driveFileId>`: the
 * person whose Google connection gives access, and Drive's file id.
 */
export type GoogleDriveBackend = {
  /** The file's bytes (or a range of them); throws `StorageNotFoundError` when it is gone or access was lost. */
  open(key: string, range?: ByteRange): Promise<Readable>;
  stat(key: string): Promise<{ sizeBytes: number } | null>;
  /**
   * A document was deleted for good in WickedHome. The backend decides whether anything happens in Drive
   * (only for files the app itself stored there as a storage target, and only when the household turned on
   * "Also remove from Drive"); it never throws.
   */
  remove?(key: string): Promise<void>;
};

let backend: GoogleDriveBackend | null = null;

/** Called once by the integrations feature. */
export function setGoogleDriveBackend(next: GoogleDriveBackend): void {
  backend = next;
}

/**
 * Documents whose bytes live in someone's Google Drive: files added from a linked Drive folder with "Add to
 * Documents (stays in Drive)", and documents moved to a Drive storage target (bills in a chosen folder, see
 * storage-targets.ts). Reading streams from Drive through the server (ranges passed through).
 *
 * - `put`: not offered. Uploads are stored locally first; a storage target then copies, verifies and re-points.
 * - `delete`: linked files are never touched in Drive (deleting the document only forgets the link). Files the
 *   app stored as a storage target go to Drive's trash only when the household turned that on (default off).
 */
export class GoogleDriveStorageProvider implements StorageProvider {
  readonly name = "GOOGLE_DRIVE" as const;

  put(_body: Readable, _options: PutOptions): Promise<StoredObject> {
    return Promise.reject(new Error("New uploads go to local storage; Drive files are added by linking"));
  }

  get(key: string, range?: ByteRange): Promise<Readable> {
    if (!backend) return Promise.reject(new StorageNotFoundError(key));
    return backend.open(key, range);
  }

  delete(key: string): Promise<void> {
    return backend?.remove ? backend.remove(key).catch(() => undefined) : Promise.resolve();
  }

  stat(key: string): Promise<{ sizeBytes: number } | null> {
    return backend ? backend.stat(key) : Promise.resolve(null);
  }
}
