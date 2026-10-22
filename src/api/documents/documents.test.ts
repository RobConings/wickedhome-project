/**
 * Unit tests for local document storage, the download helpers and the documents contract. No database
 * needed. Run on the server:
 *
 *   npx tsx --test src/api/documents/documents.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { after, before, describe, it } from "node:test";
import {
  fileCreateSchema,
  folderCreateSchema,
  normalizeMimeType,
  previewKind,
  uniqueName,
} from "@/features/documents/types/documents";
import { contentDisposition, parseRange } from "./documents-http";
import { LocalStorageProvider } from "./storage/local-storage-provider";
import { InvalidStorageKeyError, StorageLimitError, StorageNotFoundError } from "./storage/storage-provider";

const HOUSEHOLD = "cmhousehold000000000000001";

async function listAll(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

describe("LocalStorageProvider", () => {
  let root: string;
  let storage: LocalStorageProvider;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "wh-docs-"));
    storage = new LocalStorageProvider(root);
  });
  after(() => rm(root, { recursive: true, force: true }));

  it("stores under <household>/<yyyy>/<mm>/<random> and hashes while streaming", async () => {
    const content = "Van datum;Van tijdstip\n14-01-2026;00:00:00\n";
    const stored = await storage.put(Readable.from([Buffer.from(content.slice(0, 10)), Buffer.from(content.slice(10))]), {
      householdId: HOUSEHOLD,
      maxBytes: 1000,
    });
    assert.match(stored.key, new RegExp(`^${HOUSEHOLD}/\\d{4}/\\d{2}/[a-f0-9]{32}$`));
    assert.equal(stored.sizeBytes, Buffer.byteLength(content));
    assert.equal(stored.sha256, createHash("sha256").update(content).digest("hex"));
    assert.equal(await text(await storage.get(stored.key)), content);
    assert.deepEqual(await storage.stat(stored.key), { sizeBytes: stored.sizeBytes });

    const info = await stat(path.join(root, ...stored.key.split("/")));
    assert.equal(info.mode & 0o777, 0o600);
  });

  it("reads a byte range", async () => {
    const stored = await storage.put(Readable.from([Buffer.from("0123456789")]), { householdId: HOUSEHOLD, maxBytes: 100 });
    assert.equal(await text(await storage.get(stored.key, { start: 2, end: 5 })), "2345");
  });

  it("aborts once the limit is exceeded and leaves no partial file", async () => {
    const before = await listAll(root);
    const big = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
    await assert.rejects(storage.put(big, { householdId: HOUSEHOLD, maxBytes: 1000 }), StorageLimitError);
    assert.deepEqual(await listAll(root), before);
  });

  it("cleans up when the source stream fails", async () => {
    const before = await listAll(root);
    const failing = new Readable({
      read() {
        this.push(Buffer.alloc(10));
        this.destroy(new Error("client went away"));
      },
    });
    await assert.rejects(storage.put(failing, { householdId: HOUSEHOLD, maxBytes: 1000 }), /client went away/);
    assert.deepEqual(await listAll(root), before);
  });

  it("refuses keys that are not its own shape (no traversal)", async () => {
    for (const key of [
      "../etc/passwd",
      `${HOUSEHOLD}/2026/01/../../../../etc/passwd`,
      `${HOUSEHOLD}/2026/13/${"a".repeat(32)}`,
      `/${HOUSEHOLD}/2026/01/${"a".repeat(32)}`,
      `${HOUSEHOLD}/2026/01/${"A".repeat(32)}`,
      "",
    ]) {
      await assert.rejects(storage.get(key), InvalidStorageKeyError, key);
      await assert.rejects(storage.delete(key), InvalidStorageKeyError, key);
    }
    await assert.rejects(
      storage.put(Readable.from([Buffer.from("x")]), { householdId: "../evil", maxBytes: 10 }),
      InvalidStorageKeyError,
    );
  });

  it("deletes idempotently and reports missing objects", async () => {
    const stored = await storage.put(Readable.from([Buffer.from("bye")]), { householdId: HOUSEHOLD, maxBytes: 10 });
    await storage.delete(stored.key);
    await storage.delete(stored.key);
    assert.equal(await storage.stat(stored.key), null);
    await assert.rejects(storage.get(stored.key), StorageNotFoundError);
  });
});

describe("parseRange", () => {
  it("parses single ranges", () => {
    assert.equal(parseRange(undefined, 100), undefined);
    assert.deepEqual(parseRange("bytes=0-9", 100), { start: 0, end: 9 });
    assert.deepEqual(parseRange("bytes=90-", 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange("bytes=-10", 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange("bytes=50-500", 100), { start: 50, end: 99 });
  });

  it("rejects ranges outside the file and ignores what it can't parse", () => {
    assert.equal(parseRange("bytes=100-", 100), "unsatisfiable");
    assert.equal(parseRange("bytes=9-3", 100), "unsatisfiable");
    assert.equal(parseRange("bytes=-0", 100), "unsatisfiable");
    assert.equal(parseRange("bytes=0-1,5-6", 100), undefined);
    assert.equal(parseRange("items=0-1", 100), undefined);
    assert.equal(parseRange("bytes=-", 100), undefined);
  });
});

describe("contentDisposition", () => {
  it("shows only allowlisted types inline", () => {
    assert.match(contentDisposition("plan.pdf", "application/pdf", false), /^inline;/);
    assert.match(contentDisposition("plan.pdf", "application/pdf", true), /^attachment;/);
    assert.match(contentDisposition("photo.jpg", "image/jpeg", false), /^inline;/);
    assert.match(contentDisposition("logo.svg", "image/svg+xml", false), /^attachment;/);
    assert.match(contentDisposition("page.html", "text/html", false), /^attachment;/);
  });

  it("escapes the name for both the fallback and the UTF-8 form", () => {
    const header = contentDisposition('Akte "notaris" Gënt;.pdf', "application/pdf", true);
    assert.equal(header, `attachment; filename="Akte _notaris_ G_nt_.pdf"; filename*=UTF-8''Akte%20%22notaris%22%20G%C3%ABnt%3B.pdf`);
    assert.doesNotMatch(contentDisposition("a\r\nSet-Cookie: x", "text/plain", false), /[\r\n]/);
  });
});

describe("documents contract", () => {
  it("rejects names with slashes or control characters", () => {
    assert.equal(folderCreateSchema.safeParse({ name: "Huis" }).success, true);
    assert.equal(folderCreateSchema.safeParse({ name: "Huis/Notaris" }).success, false);
    assert.equal(folderCreateSchema.safeParse({ name: "..\\x" }).success, false);
    assert.equal(folderCreateSchema.safeParse({ name: "a\u0000b" }).success, false);
    assert.equal(folderCreateSchema.safeParse({ name: ".." }).success, false);
    assert.equal(folderCreateSchema.safeParse({ name: "   " }).success, false);
  });

  it("normalises mime types", () => {
    assert.equal(normalizeMimeType("Text/CSV; charset=utf-8"), "text/csv");
    assert.equal(fileCreateSchema.parse({ name: "x.csv", sizeBytes: 1, mimeType: "Text/CSV" }).mimeType, "text/csv");
    assert.equal(fileCreateSchema.parse({ name: "x", sizeBytes: 1 }).mimeType, "application/octet-stream");
    assert.equal(fileCreateSchema.safeParse({ name: "x", sizeBytes: 1, mimeType: "text/html\r\nX: y" }).success, false);
  });

  it("picks a preview kind", () => {
    assert.equal(previewKind("application/pdf"), "pdf");
    assert.equal(previewKind("image/png"), "image");
    assert.equal(previewKind("image/svg+xml"), "none");
    assert.equal(previewKind("text/csv"), "text");
  });

  it("finds a free name", () => {
    assert.equal(uniqueName("Facturen", ["Garanties"]), "Facturen");
    assert.equal(uniqueName("Facturen", ["facturen", "Facturen (2)"]), "Facturen (3)");
  });
});
