/**
 * The integrations skill: status without any token, key or secret; syncs for the person's own connection; bills
 * from mail for owners and adults, money writes always confirmed; no tool connects or disconnects Google. No
 * database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/integrations/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MailBillSuggestion } from "@/features/integrations/types/google";
import { getAssistantTool, listAssistantTools } from "@ai/core/tools";
import "@ai/skills";
import { mailBillRow } from "./mail-bills";
import { integrationsSummary } from "./tools";

const rules = (name: string) => {
  const tool = getAssistantTool(name);
  assert.ok(tool, `${name} is registered`);
  return [tool.permission, tool.confirm, [...tool.roles].sort().join(",")];
};

describe("integrations skill", () => {
  it("confirms money writes every time and keeps bills from mail for owners and adults", () => {
    assert.deepEqual(rules("integrations.status"), ["read", "never", "adult,child,owner"]);
    assert.deepEqual(rules("integrations.sync"), ["write", "first-time", "adult,child,owner"]);
    assert.deepEqual(rules("integrations.move_to_drive"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("integrations.mail_bills"), ["read", "never", "adult,owner"]);
    assert.deepEqual(rules("integrations.accept_mail_bill"), ["sensitive", "always", "adult,owner"]);
    assert.deepEqual(rules("integrations.link_mail_bill"), ["sensitive", "always", "adult,owner"]);
    assert.deepEqual(rules("integrations.dismiss_mail_bill"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("integrations.save_mail_rule"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("integrations.set_calendar"), ["write", "always", "adult,child,owner"]);
    assert.ok(getAssistantTool("integrations.accept_mail_bill")?.preview, "accepting shows the fields first");
    assert.ok(getAssistantTool("integrations.link_mail_bill")?.preview, "linking shows the fields first");
  });

  it("has no tool that connects, disconnects or reveals credentials", () => {
    for (const tool of listAssistantTools()) assert.doesNotMatch(tool.name, /connect|oauth|token|secret|vapid|api_key|credential/i, tool.name);
  });

  it("reports the status without tokens, keys or the assistant's API key", () => {
    const result = integrationsSummary(
      {
        google: {
          status: "connected",
          missing: [],
          redirectUri: "https://home.example/api/integrations/google/callback",
          connectOrigin: "https://home.example",
          connection: { email: "rob@gmail.example", status: "connected", lastError: null, connectedAt: "2026-09-01T10:00:00.000Z", features: ["calendar", "gmail"] },
          calendar: {
            calendars: [{ id: "c1", name: "Rob", color: "#124734", primary: true, canWrite: true, selected: true, visibility: "household", eventCount: 12, lastSyncedAt: "2026-10-04T08:15:00.000Z", lastError: null }],
            publish: { calendarId: null, categories: [], publishedCount: 0, lastPublishedAt: null, lastError: null },
          },
          gmail: { lastScanAt: "2026-10-04T06:40:00.000Z", lastError: null, pendingCount: 2 },
          drive: null,
        },
        ha: { state: "connected", url: "http://192.168.1.10:8123", haVersion: "2026.9.1", entityCount: 240, connectedAt: null, lastEventAt: null, errorCode: null, errorMessage: null, nextRetryAt: null } as never,
        drive: null,
        assistant: { baseUrl: "http://192.168.1.20:1234/v1", model: "qwen3", apiKey: "sk-very-secret", sttUrl: null, sttModel: "whisper-1", thinking: false, vision: true, problem: null },
      },
      "nl",
    );
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /sk-very-secret|redirect|callback|192\.168|apiKey/);
    assert.equal(result.google.gmail?.waiting, 2);
    assert.equal(result.google.calendar?.lastSync, "04/10/2026 10:15");
    assert.equal(result.assistant.configured, true);
  });

  it("shows bills from mail without IBAN, structured communication or e-mail addresses", () => {
    const suggestion: MailBillSuggestion = {
      id: "s1",
      payee: "Fluvius",
      category: "energy",
      subject: "Uw factuur van oktober",
      receivedAt: "2026-10-02T09:00:00.000Z",
      amountCents: 8540,
      dueDate: "2026-10-16",
      structuredCommunication: "123456789012",
      iban: "BE68539007547034",
      attachmentName: "factuur.pdf",
      mailboxOwner: "rob@example.com",
      status: "pending",
      matches: [],
      rememberedRecurringId: null,
    };
    const row = mailBillRow(suggestion, "nl");
    const text = JSON.stringify(row);
    assert.doesNotMatch(text, /BE68|123456789012|@/);
    assert.equal(row.amount, "€ 85,40");
    assert.equal(row.mail, "02/10/2026");
    assert.equal(row.looksLike, null);
  });
});
