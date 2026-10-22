/**
 * Unit tests for storage targets (bill documents → Google Drive): which files belong to a target, when the retry
 * job tries again, verification of a remote copy, and the order of a move (the local copy goes only after the
 * remote copy is verified and the row points at it). No database needed:
 *
 *   npx tsx --test src/api/documents/storage-targets.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_TARGET_KINDS, storageTargetOf } from "@/features/documents/types/documents";
import {
  FAILED_AFTER_ATTEMPTS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  isMoveDue,
  nextAttemptAt,
  verifiedMove,
  verifyCopy,
  type LocalDigest,
  type PendingMove,
} from "./storage/storage-targets";

const NOW = new Date("2026-10-03T10:00:00.000Z");
const local: LocalDigest = { sizeBytes: 1234, sha256: "a".repeat(64), md5: "b".repeat(32) };

describe("target resolution", () => {
  it("knows the bills target", () => {
    assert.deepEqual(STORAGE_TARGET_KINDS, ["bills"]);
  });

  it("files attached to an expense are bill documents", () => {
    assert.equal(storageTargetOf(["bill"]), "bills");
    assert.equal(storageTargetOf(["appliance", "bill"]), "bills");
  });

  it("other files have no target", () => {
    assert.equal(storageTargetOf([]), null);
    assert.equal(storageTargetOf(["appliance", "task", "project"]), null);
    assert.equal(storageTargetOf(["subscription"]), null);
  });
});

describe("retry schedule", () => {
  it("backs off from 5 minutes, doubling, to at most 12 hours", () => {
    assert.equal(nextAttemptAt(1, NOW).getTime() - NOW.getTime(), RETRY_BASE_MS);
    assert.equal(nextAttemptAt(2, NOW).getTime() - NOW.getTime(), 2 * RETRY_BASE_MS);
    assert.equal(nextAttemptAt(4, NOW).getTime() - NOW.getTime(), 8 * RETRY_BASE_MS);
    assert.equal(nextAttemptAt(30, NOW).getTime() - NOW.getTime(), RETRY_MAX_MS);
    assert.ok(FAILED_AFTER_ATTEMPTS > 1);
  });

  const pending = (extra: Partial<PendingMove> = {}): PendingMove => ({
    pendingTarget: "bills",
    targetNextAttemptAt: null,
    storageProvider: "LOCAL",
    deletedAt: null,
    uploadedAt: new Date("2026-10-01T08:00:00.000Z"),
    ...extra,
  });

  it("selects pending local files that are due", () => {
    assert.equal(isMoveDue(pending(), NOW), true);
    assert.equal(isMoveDue(pending({ targetNextAttemptAt: new Date(NOW.getTime() - 1) }), NOW), true);
    assert.equal(isMoveDue(pending({ targetNextAttemptAt: NOW }), NOW), true);
  });

  it("skips files not due yet, not pending, already moved, trashed or never uploaded", () => {
    assert.equal(isMoveDue(pending({ targetNextAttemptAt: new Date(NOW.getTime() + 60_000) }), NOW), false);
    assert.equal(isMoveDue(pending({ pendingTarget: null }), NOW), false);
    assert.equal(isMoveDue(pending({ storageProvider: "GOOGLE_DRIVE" }), NOW), false);
    assert.equal(isMoveDue(pending({ deletedAt: NOW }), NOW), false);
    assert.equal(isMoveDue(pending({ uploadedAt: null }), NOW), false);
  });
});

describe("verification of the remote copy", () => {
  it("accepts the same size and SHA-256 (case-insensitive)", () => {
    assert.deepEqual(verifyCopy(local, { sizeBytes: 1234, sha256: "A".repeat(64), md5: null }, local.sha256), { ok: true });
  });

  it("falls back to MD5 when the target gives no SHA-256", () => {
    assert.deepEqual(verifyCopy(local, { sizeBytes: 1234, sha256: null, md5: "b".repeat(32) }, null), { ok: true });
    assert.equal(verifyCopy(local, { sizeBytes: 1234, sha256: null, md5: "c".repeat(32) }, null).ok, false);
  });

  it("prefers SHA-256 over MD5 when both are there", () => {
    assert.equal(verifyCopy(local, { sizeBytes: 1234, sha256: "f".repeat(64), md5: "b".repeat(32) }, null).ok, false);
  });

  it("refuses a different size, no checksum at all, or a local file that changed since upload", () => {
    assert.equal(verifyCopy(local, { sizeBytes: 1233, sha256: local.sha256, md5: local.md5 }, null).ok, false);
    assert.equal(verifyCopy(local, { sizeBytes: 1234, sha256: null, md5: null }, null).ok, false);
    assert.equal(verifyCopy(local, { sizeBytes: 1234, sha256: local.sha256, md5: null }, "d".repeat(64)).ok, false);
  });
});

describe("a move deletes the local copy only after verification", () => {
  type Copy = { sizeBytes: number; sha256: string | null; md5: string | null; key: string };
  const good: Copy = { sizeBytes: 1234, sha256: local.sha256, md5: local.md5, key: "remote-1" };

  function run(copy: Copy | Error, commitResult = true) {
    const calls: string[] = [];
    const promise = verifiedMove<Copy>({
      expectedSha256: local.sha256,
      digest: async () => {
        calls.push("digest");
        return local;
      },
      upload: async () => {
        calls.push("upload");
        if (copy instanceof Error) throw copy;
        return copy;
      },
      commit: async () => {
        calls.push("commit");
        return commitResult;
      },
      deleteLocal: async () => {
        calls.push("deleteLocal");
      },
      discard: async (discarded) => {
        calls.push(`discard:${discarded.key}`);
      },
    });
    return { promise, calls };
  }

  it("verified: re-points the row, then deletes the local copy", async () => {
    const { promise, calls } = run(good);
    assert.equal(await promise, "moved");
    assert.deepEqual(calls, ["digest", "upload", "commit", "deleteLocal"]);
  });

  it("a wrong checksum discards the remote copy and keeps the local one", async () => {
    const { promise, calls } = run({ ...good, sha256: "e".repeat(64) });
    await assert.rejects(promise, /SHA-256 differs/);
    assert.deepEqual(calls, ["digest", "upload", "discard:remote-1"]);
  });

  it("a short upload is refused the same way", async () => {
    const { promise, calls } = run({ ...good, sizeBytes: 1000 });
    await assert.rejects(promise, /Size differs/);
    assert.ok(!calls.includes("deleteLocal") && !calls.includes("commit"));
  });

  it("a failed upload changes nothing", async () => {
    const { promise, calls } = run(new Error("Drive unreachable"));
    await assert.rejects(promise, /Drive unreachable/);
    assert.deepEqual(calls, ["digest", "upload"]);
  });

  it("a row that changed meanwhile (deleted, moved) keeps its bytes and the copy is discarded", async () => {
    const { promise, calls } = run(good, false);
    assert.equal(await promise, "gone");
    assert.deepEqual(calls, ["digest", "upload", "commit", "discard:remote-1"]);
  });
});
