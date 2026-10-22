/**
 * The audit log without a database: how a record is cleaned before it is stored (secrets hidden, one line,
 * cut to size), the list cursor, search words and retention.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/audit/audit.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditCutoff, decodeAuditCursor, encodeAuditCursor, redactSecrets, searchWords, toAuditRow, type AuditActor } from "./audit-entry";

const actor: AuditActor = { householdId: "h1", userId: "u1", name: "Rob", channel: "app" };

describe("toAuditRow", () => {
  it("keeps who, what and the target", () => {
    const row = toAuditRow(actor, { action: "account.role_changed", targetType: "account", targetId: "c123", targetLabel: "Lotte", summary: "Role: adult → child" });
    assert.deepEqual(row, {
      householdId: "h1",
      userId: "u1",
      actorName: "Rob",
      channel: "app",
      action: "account.role_changed",
      targetType: "account",
      targetId: "c123",
      targetLabel: "Lotte",
      summary: "Role: adult → child",
    });
  });

  it("makes texts one line, drops empty ones and cuts long ones", () => {
    const row = toAuditRow(actor, { action: "x.y", targetLabel: "  ", summary: `line one\n\nline   two ${"word ".repeat(200)}` });
    assert.equal(row.targetLabel, null);
    assert.ok(row.summary?.startsWith("line one line two"));
    assert.equal(row.summary?.length, 500);
    assert.ok(row.summary?.endsWith("…"));
  });

  it("hides anything that looks like a secret", () => {
    const row = toAuditRow(actor, {
      action: "x.y",
      summary: "token wh_mcp_abcDEF123_xyz, Bearer abc.def, code: 1234, password=hunter2 link 0123456789abcdefghijABCDEFGHIJ_-xyz",
    });
    assert.ok(!row.summary?.includes("wh_mcp_abc"));
    assert.ok(!row.summary?.includes("abc.def"));
    assert.ok(!row.summary?.includes("1234,"));
    assert.ok(!row.summary?.includes("hunter2"));
    assert.ok(!row.summary?.includes("0123456789abcdefghij"));
    assert.equal(redactSecrets("Role: adult → child"), "Role: adult → child");
  });

  it("never touches ids and action keys", () => {
    const row = toAuditRow({ ...actor, channel: "job", userId: null, name: "expenses.auto-pay" }, { action: "expense.auto_paid", targetId: "cmg8x1y2z0000abcd1234efgh" });
    assert.equal(row.targetId, "cmg8x1y2z0000abcd1234efgh");
    assert.equal(row.actorName, "expenses.auto-pay");
    assert.equal(row.userId, null);
  });
});

describe("cursor, search and retention", () => {
  it("round-trips the cursor and refuses garbage", () => {
    const createdAt = new Date("2026-10-03T08:15:00.123Z");
    assert.deepEqual(decodeAuditCursor(encodeAuditCursor(createdAt, "abc")), { createdAt, id: "abc" });
    assert.equal(decodeAuditCursor("nonsense"), null);
    assert.equal(decodeAuditCursor("2026-13-45|x"), null);
    assert.equal(decodeAuditCursor(undefined), null);
  });

  it("splits the search into at most six words", () => {
    assert.deepEqual(searchWords("  alarm   Clara "), ["alarm", "Clara"]);
    assert.equal(searchWords("a b c d e f g h").length, 6);
    assert.deepEqual(searchWords(undefined), []);
  });

  it("keeps 365 days", () => {
    assert.equal(auditCutoff(new Date("2026-10-03T12:00:00Z"), 365).toISOString(), "2025-10-03T12:00:00.000Z");
  });
});

// Which assistant tool calls the runner records: ai/core/tool-audit.test.ts.
