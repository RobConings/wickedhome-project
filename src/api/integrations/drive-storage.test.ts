/**
 * Unit tests for Google Drive as storage for bill documents: the scope decision per folder mode, when a target is
 * usable, year folders, storage keys, and the resumable upload against a fake Drive (chunks, resuming after a
 * 503 and a dropped connection). No database needed:
 *
 *   npx tsx --test src/api/integrations/drive-storage.test.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import { featureForFolderMode, missingFeatureForFolderMode } from "@/features/integrations/types/drive-storage";
import { GOOGLE_FEATURE_SCOPES, featuresFromScopes } from "@/features/integrations/types/google";
import { parseTargetKey, targetKey } from "./drive-storage-keys";
import { handlerState, resolveTargetState, yearOf } from "./drive-storage-state";
import type * as DriveUpload from "./drive-upload";
import { setGoogleFetch } from "./google-http";
import { scopesFor } from "./google-oauth";

const DRIVE = [...GOOGLE_FEATURE_SCOPES.drive];
const FULL = [...GOOGLE_FEATURE_SCOPES.drive_full];

describe("scope decision", () => {
  it("a new folder works with drive.file (the Drive feature); an existing one needs the full drive scope", () => {
    assert.equal(featureForFolderMode("create"), "drive");
    assert.equal(featureForFolderMode("pick"), "drive_full");
    assert.deepEqual(scopesFor(["drive_full"]), ["email", "https://www.googleapis.com/auth/drive", "openid"]);
  });

  it("asks only for what is missing, Drive first", () => {
    assert.equal(missingFeatureForFolderMode("create", []), "drive");
    assert.equal(missingFeatureForFolderMode("pick", ["calendar"]), "drive");
    assert.equal(missingFeatureForFolderMode("create", ["drive"]), null);
    assert.equal(missingFeatureForFolderMode("pick", ["drive"]), "drive_full");
    assert.equal(missingFeatureForFolderMode("pick", ["drive", "drive_full"]), null);
  });

  it("the full scope is its own feature (it doesn't hide or replace Drive)", () => {
    assert.deepEqual(featuresFromScopes([...DRIVE, ...FULL]), ["drive", "drive_full"]);
    assert.deepEqual(featuresFromScopes(FULL), ["drive_full"]);
  });
});

describe("target state", () => {
  const created = { folderMode: "CREATED" as const };
  const picked = { folderMode: "PICKED" as const };
  const connected = (scopes: string[]) => ({ status: "CONNECTED" as const, scopes });

  it("no target: off", () => {
    assert.deepEqual(resolveTargetState(null, connected(DRIVE)), { state: "off", pausedReason: null });
    assert.equal(handlerState(resolveTargetState(null, null)), "off");
  });

  it("active with the scopes its folder mode needs", () => {
    assert.equal(resolveTargetState(created, connected(DRIVE)).state, "active");
    assert.equal(resolveTargetState(picked, connected([...DRIVE, ...FULL])).state, "active");
    assert.equal(handlerState(resolveTargetState(created, connected(DRIVE))), "active");
  });

  it("disconnected (or Google not configured): new files stay local, nothing is queued", () => {
    const resolved = resolveTargetState(created, null);
    assert.deepEqual(resolved, { state: "paused", pausedReason: "disconnected" });
    assert.equal(handlerState(resolved), "off");
    assert.equal(handlerState(resolveTargetState(created, connected(DRIVE), false)), "off");
  });

  it("a refused consent or a missing scope queues files (paused)", () => {
    const reconnect = resolveTargetState(created, { status: "NEEDS_RECONNECT", scopes: DRIVE });
    assert.deepEqual(reconnect, { state: "paused", pausedReason: "needs_reconnect" });
    assert.equal(handlerState(reconnect), "paused");
    const scope = resolveTargetState(picked, connected(DRIVE));
    assert.deepEqual(scope, { state: "paused", pausedReason: "missing_scope" });
    assert.equal(handlerState(scope), "paused");
  });
});

describe("year folders and keys", () => {
  it("uses the Brussels year of the upload", () => {
    assert.equal(yearOf(new Date("2025-12-31T23:30:00.000Z")), "2026");
    assert.equal(yearOf(new Date("2026-06-30T12:00:00.000Z")), "2026");
  });

  it("target keys carry the kind and the user, and only parse when well-formed", () => {
    const key = targetKey("bills", "cmuser0000000000000000001", "1AbC_d-EfG");
    assert.equal(key, "gdrive-target:bills:cmuser0000000000000000001:1AbC_d-EfG");
    assert.deepEqual(parseTargetKey(key), { kind: "bills", userId: "cmuser0000000000000000001", fileId: "1AbC_d-EfG" });
    assert.equal(parseTargetKey("gdrive:cmconn000000000000000001:1AbC"), null);
    assert.equal(parseTargetKey("gdrive-target:manuals:cmuser0000000000000000001:1AbC"), null);
    assert.equal(parseTargetKey("gdrive-target:bills:../x:1AbC"), null);
  });
});

describe("resumable upload to a fake Drive", () => {
  const CHUNK = 256 * 1024;
  const content = randomBytes(CHUNK * 2 + 1000);
  const md5 = createHash("md5").update(content).digest("hex");
  const sha256 = createHash("sha256").update(content).digest("hex");
  const open = async (range?: { start: number; end: number }) =>
    Readable.from([range ? content.subarray(range.start, range.end + 1) : content]);

  let restore: ReturnType<typeof setGoogleFetch> | null = null;
  // Imported after the environment is set: the server config is read once, at import.
  let uploadToDrive: typeof DriveUpload.uploadToDrive;
  let nextOffset: typeof DriveUpload.nextOffset;
  const connection = { id: "cmconn000000000000000001", userId: "cmuser0000000000000000001", refreshTokenEnc: "unused", status: "CONNECTED" as const };

  before(async () => {
    process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
    process.env.INTEGRATIONS_KEY ??= randomBytes(32).toString("base64");
    process.env.GOOGLE_CLIENT_ID ??= "test-client";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-secret";
    const access = await import("./google-access");
    access.seedAccessToken(connection.id, { accessToken: "token-1", expiresAt: Date.now() + 3_600_000, refreshToken: null, scopes: DRIVE, idToken: null });
    ({ uploadToDrive, nextOffset } = await import("./drive-upload"));
  });

  it("reads the resume offset from a 308 answer", () => {
    assert.equal(nextOffset("bytes=0-262143"), 262144);
    assert.equal(nextOffset(null), 0);
  });

  after(() => {
    if (restore) setGoogleFetch(restore);
  });

  /** A fake Drive upload endpoint; `faults` decides per chunk PUT whether to fail it. */
  function fakeDrive(faults: (put: number) => "ok" | "503" | "drop" | "partial" = () => "ok") {
    const received = Buffer.alloc(content.length);
    let have = 0;
    let puts = 0;
    const log: string[] = [];
    const previous = setGoogleFetch(async (input, init) => {
      const url = new URL(input);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer token-1");
      if (init?.method === "POST") {
        assert.match(url.search, /uploadType=resumable/);
        const meta = JSON.parse(String(init.body)) as { parents: string[]; name: string };
        assert.deepEqual(meta.parents, ["folder-2026"]);
        assert.equal(headers.get("x-upload-content-length"), String(content.length));
        log.push("start");
        return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=abc" } });
      }
      const range = headers.get("content-range") ?? "";
      const body = Buffer.from((init?.body as Uint8Array | undefined) ?? new Uint8Array(0));
      const status = () =>
        have === content.length
          ? Response.json({ id: "drive-file-1", size: String(have), md5Checksum: md5, sha256Checksum: sha256 }, { status: 200 })
          : new Response(null, { status: 308, headers: have > 0 ? { range: `bytes=0-${have - 1}` } : {} });
      if (range.startsWith("bytes */")) {
        log.push(`status@${have}`);
        return status();
      }
      const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(range);
      assert.ok(match, `chunk without Content-Range: ${range}`);
      const start = Number(match[1]);
      const end = Number(match[2]);
      assert.equal(start, have, "chunks must continue where the session is");
      assert.equal(body.length, end - start + 1);
      const fault = faults(puts++);
      log.push(`put ${start}-${end}${fault === "ok" ? "" : ` ${fault}`}`);
      if (fault === "503") return new Response("busy", { status: 503 });
      if (fault === "drop") throw new TypeError("fetch failed");
      // `partial`: Drive kept only the first 256 KiB of this chunk and asks for the rest.
      const keep = fault === "partial" ? Math.min(body.length, CHUNK) : body.length;
      body.copy(received, start, 0, keep);
      have = start + keep;
      return status();
    });
    restore ??= previous;
    return { log, received: () => received.subarray(0, have) };
  }

  const upload = () =>
    uploadToDrive(connection, { name: "Factuur.pdf", mimeType: "application/pdf", sizeBytes: content.length, parentId: "folder-2026", open, chunkBytes: CHUNK * 2, sleep: async () => undefined });

  it("uploads in chunks and returns Drive's checksums", async () => {
    const drive = fakeDrive();
    const file = await upload();
    assert.deepEqual(file, { id: "drive-file-1", size: String(content.length), md5Checksum: md5, sha256Checksum: sha256 });
    assert.deepEqual(drive.log, ["start", `put 0-${CHUNK * 2 - 1}`, `put ${CHUNK * 2}-${content.length - 1}`]);
    assert.ok(drive.received().equals(content));
  });

  it("follows Drive's offset when it kept only part of a chunk", async () => {
    const drive = fakeDrive((put) => (put === 0 ? "partial" : "ok"));
    await upload();
    assert.deepEqual(drive.log, ["start", `put 0-${CHUNK * 2 - 1} partial`, `put ${CHUNK}-${content.length - 1}`]);
    assert.ok(drive.received().equals(content));
  });

  it("resumes after a 503 and after a dropped connection", async () => {
    const drive = fakeDrive((put) => (put === 1 ? "503" : put === 2 ? "drop" : "ok"));
    await upload();
    assert.ok(drive.log.includes(`status@${CHUNK * 2}`));
    assert.ok(drive.received().equals(content));
  });

  it("gives up after repeated failures (the file stays local and is retried later)", async () => {
    fakeDrive((put) => (put >= 1 ? "503" : "ok"));
    await assert.rejects(upload(), /answered 503/);
  });
});
