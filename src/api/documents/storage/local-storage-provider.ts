import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  InvalidStorageKeyError,
  StorageLimitError,
  StorageNotFoundError,
  type ByteRange,
  type PutOptions,
  type StorageProvider,
  type StoredObject,
} from "./storage-provider";

/** Household ids are cuids; refuse anything else before it gets near a path. */
const HOUSEHOLD_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** `<householdId>/<yyyy>/<mm>/<32 hex>`: the only shape `put` produces and `get`/`delete` accept. */
const KEY = /^[A-Za-z0-9_-]{1,64}\/\d{4}\/(0[1-9]|1[0-2])\/[a-f0-9]{32}$/;

/**
 * Stores files on the server's disk:
 *
 *   <root>/<householdId>/<yyyy>/<mm>/<random-id>
 *
 * - Paths are built only from the household id, the date and 128 random bits; never from file names.
 * - Every key is validated against `KEY` and the resolved path must stay inside `root` (no traversal).
 * - Writes go to a temporary file in the same folder, are fsynced, then renamed into place (atomic), so a
 *   reader never sees half a file and an aborted upload leaves nothing behind.
 * - The SHA-256 and size are computed while streaming; the size limit aborts the stream early.
 * - Files are created with mode 0600 and folders 0700: only the app user can read them.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "LOCAL" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    if (!KEY.test(key)) throw new InvalidStorageKeyError();
    const full = path.resolve(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + path.sep)) throw new InvalidStorageKeyError();
    return full;
  }

  async put(body: Readable, { householdId, maxBytes }: PutOptions): Promise<StoredObject> {
    if (!HOUSEHOLD_ID.test(householdId)) throw new InvalidStorageKeyError();
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const key = `${householdId}/${yyyy}/${mm}/${randomBytes(16).toString("hex")}`;
    const target = this.resolve(key);
    const temp = `${path.dirname(target)}/.${path.basename(target)}.partial`;

    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });

    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        if (sizeBytes > maxBytes) return callback(new StorageLimitError(maxBytes));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    // `flush: true` fsyncs before close, so the rename below publishes a complete file.
    const out = createWriteStream(temp, { flags: "wx", mode: 0o600, flush: true });

    try {
      await pipeline(body, meter, out);
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    return { key, sizeBytes, sha256: hash.digest("hex") };
  }

  async get(key: string, range?: ByteRange): Promise<Readable> {
    const file = this.resolve(key);
    if (!(await this.stat(key))) throw new StorageNotFoundError(key);
    return createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile() ? { sizeBytes: info.size } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
