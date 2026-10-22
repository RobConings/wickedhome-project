import type { Readable } from "node:stream";
import type { ByteRange } from "../documents/storage/storage-provider";
import { readLimitedText } from "../lib/safe-fetch";
import { withGoogle, type ConnectionForAccess } from "./google-access";
import { GoogleApiError, assertOk, googleRequest } from "./google-http";

/*
 * Resumable upload to Google Drive (https://developers.google.com/drive/api/guides/manage-uploads#resumable):
 * one POST with the metadata opens an upload session, then the bytes go in chunks of 8 MiB (a multiple of
 * 256 KiB, as Drive requires) read from the local copy by range. A chunk that fails (network, 5xx, 429) asks the
 * session how much arrived and resumes from there, a few times with a growing pause. The finished upload
 * answers with the file's id, size and Drive's own checksums, which the documents feature verifies.
 */

const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const UPLOAD_FIELDS = "id,name,size,md5Checksum,sha256Checksum";
export const CHUNK_BYTES = 8 * 1024 * 1024;
const RETRIES = 4;

export type UploadedDriveFile = { id: string; name?: string; size?: string; md5Checksum?: string; sha256Checksum?: string };

export type DriveUploadInput = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  parentId: string;
  /** Reads (part of) the local bytes; called once per chunk and again when resuming. */
  open: (range?: ByteRange) => Promise<Readable>;
  signal?: AbortSignal;
  /** Tests: a smaller chunk size (still a multiple of 256 KiB). */
  chunkBytes?: number;
  /** Tests: no real pauses between retries. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function readRange(open: DriveUploadInput["open"], start: number, end: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await open({ start, end })) chunks.push(Buffer.from(chunk as Uint8Array));
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== end - start + 1) throw new Error("The local file changed while uploading");
  return bytes;
}

/** `Range: bytes=0-1234` of a 308 answer → the next offset (1235); no header → nothing arrived yet. */
export function nextOffset(range: string | null): number {
  const match = range ? /bytes=0-(\d+)/.exec(range) : null;
  return match?.[1] ? Number(match[1]) + 1 : 0;
}

const retryable = (error: unknown) =>
  error instanceof GoogleApiError && (error.status === null || error.status === 429 || error.status >= 500);

async function finished(response: Response, url: string): Promise<UploadedDriveFile> {
  await assertOk(response, url);
  const text = await readLimitedText(response, 100_000);
  try {
    const file = JSON.parse(text) as UploadedDriveFile;
    if (typeof file.id !== "string" || !file.id) throw new Error("no id");
    return file;
  } catch {
    throw new GoogleApiError("Drive sent an invalid upload answer", response.status);
  }
}

/** Uploads a file into `parentId` and returns Drive's description of it (id, size, checksums). */
export async function uploadToDrive(connection: ConnectionForAccess, input: DriveUploadInput): Promise<UploadedDriveFile> {
  const { name, mimeType, sizeBytes, parentId, open, signal } = input;
  const chunkBytes = input.chunkBytes ?? CHUNK_BYTES;
  const sleep = input.sleep ?? defaultSleep;

  const start = `${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=${UPLOAD_FIELDS}`;
  const session = await withGoogle(connection, async (accessToken) => {
    const response = await googleRequest(start, {
      method: "POST",
      accessToken,
      signal,
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(sizeBytes) },
      body: JSON.stringify({ name, mimeType, parents: [parentId] }),
    });
    await assertOk(response, start);
    await response.body?.cancel().catch(() => undefined);
    const location = response.headers.get("location");
    if (!location) throw new GoogleApiError("Drive didn't start the upload");
    return location;
  });

  /** One PUT to the session; `undefined` body = a status query. Resolves with the raw answer. */
  const put = (headers: Record<string, string>, body?: Uint8Array) =>
    withGoogle(connection, (accessToken) =>
      googleRequest(session, { method: "PUT", accessToken, signal, timeoutMs: 300_000, headers, body: body ?? new Uint8Array(0) }),
    );

  if (sizeBytes === 0) return finished(await put({ "Content-Type": mimeType }), session);

  let offset = 0;
  let failures = 0;
  while (offset < sizeBytes) {
    if (signal?.aborted) throw new GoogleApiError("Upload stopped");
    const end = Math.min(offset + chunkBytes, sizeBytes) - 1;
    try {
      const bytes = await readRange(open, offset, end);
      const response = await put({ "Content-Type": mimeType, "Content-Range": `bytes ${offset}-${end}/${sizeBytes}` }, bytes);
      if (response.status === 308) {
        await response.body?.cancel().catch(() => undefined);
        offset = nextOffset(response.headers.get("range"));
        failures = 0;
        continue;
      }
      return await finished(response, session);
    } catch (error) {
      if (!retryable(error) || ++failures > RETRIES) throw error;
      await sleep(1000 * 2 ** (failures - 1));
      // Ask the session how far it got, then resume from there (or it may already be complete).
      const status = await put({ "Content-Range": `bytes */${sizeBytes}` }).catch((statusError: unknown) => {
        if (retryable(statusError)) return null;
        throw statusError;
      });
      if (!status) continue;
      if (status.status === 308) {
        await status.body?.cancel().catch(() => undefined);
        offset = nextOffset(status.headers.get("range"));
        continue;
      }
      if (status.ok) return finished(status, session);
      await assertOk(status, session);
    }
  }
  throw new GoogleApiError("Drive didn't confirm the upload");
}
