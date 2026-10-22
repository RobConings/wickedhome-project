/**
 * Confirming with edits and a choice (a tool's `confirmation`): the card offers editable arguments and choice
 * buttons; the amended arguments are validated by the tool's schema again, previewed again, stored, run and
 * audited as confirmed; anything the tool doesn't allow changes nothing. Backward compatible: a plain Confirm
 * runs the model's arguments. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/confirm-edits.test.ts
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { z } from "zod";
import type { AssistantStreamEvent } from "@/features/assistant/types/assistant";
import type { SessionUser } from "@/features/auth/types/auth";
import { badRequest } from "@/api/lib/http";
import { InvalidConfirmationError, amendedArguments, resolveConfirmation, runAssistantLoop, type LoopDeps, type LoopMessage, type NewLoopMessage } from "./assistant-loop";
import type { ChatModel, ChatResult } from "./llm-client";
import { registerAssistantTool, setAssistantToolAuditor, unregisterAssistantTool, type RegisteredAssistantTool } from "./tools";

const user: SessionUser = { id: "u1", email: "rob@example.com", name: "Rob", role: "adult", locale: "nl", householdId: "h1", householdName: "Test", habitantId: null };

const ran: { subject: string; body: string; action: string }[] = [];
const audited: unknown[] = [];

const letter = registerAssistantTool({
  name: "edittest.letter",
  description: "Write a letter.",
  input: z.object({ to: z.string().min(1), subject: z.string().trim().min(1).max(40), body: z.string().min(1).max(200), action: z.enum(["send", "draft"]).default("draft") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Wrote a letter", nl: "Brief geschreven" },
  confirmation: {
    editable: ["subject", "body"],
    choices: { field: "action", options: [{ value: "send", label: { en: "Send", nl: "Versturen" } }, { value: "draft", label: { en: "Save as draft", nl: "Als concept bewaren" } }] },
  },
  describe: (_ctx, input) => `${input.action}: “${input.subject}” to ${input.to}`,
  preview: (_ctx, input) => {
    if (input.body.includes("FORBIDDEN")) throw badRequest("That body can't be sent");
    return { kind: "fields", data: { fields: [{ label: "Subject", value: input.subject }] } };
  },
  run: (_ctx, input) => {
    ran.push({ subject: input.subject, body: input.body, action: input.action });
    return { done: `${input.action} ${input.subject}` };
  },
});
setAssistantToolAuditor(async (_tool, _ctx, input) => {
  audited.push(input);
});
after(() => {
  unregisterAssistantTool(letter.name);
  setAssistantToolAuditor(null);
});

function harness(tools: RegisteredAssistantTool[] = [letter]) {
  const history: LoopMessage[] = [];
  const events: AssistantStreamEvent[] = [];
  const updates: { id: string; patch: Partial<NewLoopMessage> }[] = [];
  let id = 0;
  const answers: Partial<ChatResult>[] = [
    { toolCalls: [{ id: "c1", type: "function", function: { name: "edittest_letter", arguments: JSON.stringify({ to: "Jan", subject: "Offerte", body: "Dag Jan" }) } }] },
    { content: "Klaar." },
  ];
  const model: ChatModel = async () => {
    const answer = answers.shift() ?? { content: "Klaar." };
    return { content: answer.content ?? "", toolCalls: answer.toolCalls ?? [], finishReason: "stop" };
  };
  const deps: LoopDeps = {
    model,
    tools,
    ctx: { user, householdId: "h1", locale: "nl", signal: new AbortController().signal, channel: "chat" },
    systemPrompt: "test",
    rememberedSkips: new Set(),
    emit: (event) => events.push(event),
    save: async (message) => ({ ...message, id: `m${(id += 1)}` }),
    update: async (messageId, patch) => {
      updates.push({ id: messageId, patch });
    },
    remember: async () => undefined,
  };
  history.push({ id: "q0", role: "user", content: "Mail Jan" });
  return { history, events, updates, deps };
}

async function pausedCard() {
  const h = harness();
  assert.equal(await runAssistantLoop(h.history, h.deps), "paused");
  const card = h.events.find((event) => event.type === "confirm");
  assert.ok(card && card.type === "confirm");
  return { h, card };
}

describe("confirming with edits and a choice", () => {
  beforeEach(() => {
    ran.splice(0);
    audited.splice(0);
  });

  it("offers the editable fields and the choices on the card, in the person's language", async () => {
    const { card } = await pausedCard();
    assert.deepEqual(card.options, {
      editable: ["subject", "body"],
      choices: [
        { value: "send", label: "Versturen" },
        { value: "draft", label: "Als concept bewaren" },
      ],
    });
    assert.equal(ran.length, 0);
  });

  it("runs, stores and audits the amended arguments with the chosen action", async () => {
    const { h, card } = await pausedCard();
    const outcome = await resolveConfirmation(h.history, card.messageId, { decision: "confirm", edits: { subject: "Vraag offerte badkamer", body: "Dag Jan, kan je langskomen?" }, choice: "send" }, h.deps);
    assert.equal(outcome, "done");
    assert.deepEqual(ran, [{ subject: "Vraag offerte badkamer", body: "Dag Jan, kan je langskomen?", action: "send" }]);
    assert.deepEqual(audited, [{ to: "Jan", subject: "Vraag offerte badkamer", body: "Dag Jan, kan je langskomen?", action: "send" }]);
    const stored = h.updates.find((update) => update.patch.toolArgs !== undefined);
    assert.deepEqual(stored?.patch.toolArgs, { to: "Jan", subject: "Vraag offerte badkamer", body: "Dag Jan, kan je langskomen?", action: "send" });
    assert.equal(stored?.patch.toolSummary, "send: “Vraag offerte badkamer” to Jan");
    const message = h.history.find((entry) => entry.id === card.messageId);
    assert.deepEqual(message?.toolResult, { ok: true, data: { result: { done: "send Vraag offerte badkamer" }, changedByPerson: ["subject", "body"] } });
  });

  it("takes a choice alone; a plain Confirm runs the model's arguments (backward compatible)", async () => {
    const first = await pausedCard();
    await resolveConfirmation(first.h.history, first.card.messageId, { decision: "confirm", choice: "draft" }, first.h.deps);
    const second = await pausedCard();
    await resolveConfirmation(second.h.history, second.card.messageId, { decision: "confirm" }, second.h.deps);
    assert.deepEqual(ran, [
      { subject: "Offerte", body: "Dag Jan", action: "draft" },
      { subject: "Offerte", body: "Dag Jan", action: "draft" },
    ]);
    const plain = second.h.history.find((entry) => entry.id === second.card.messageId);
    assert.deepEqual(plain?.toolResult, { ok: true, data: { done: "draft Offerte" } });
  });

  it("refuses fields that aren't editable, unknown choices, invalid values and previews that refuse: nothing runs", async () => {
    const { h, card } = await pausedCard();
    const tries = [
      { edits: { to: "someone-else@example.com" } },
      { choice: "delete" },
      { edits: { subject: "x".repeat(41) } },
      { edits: { body: "FORBIDDEN words" } },
    ];
    for (const extra of tries) {
      await assert.rejects(resolveConfirmation(h.history, card.messageId, { decision: "confirm", ...extra }, h.deps), InvalidConfirmationError, JSON.stringify(extra));
    }
    assert.equal(ran.length, 0);
    assert.equal(audited.length, 0);
    assert.equal(h.history.find((entry) => entry.id === card.messageId)?.toolStatus, "pending", "the card stays");
  });

  it("amendedArguments leaves the stored arguments alone without edits", async () => {
    const stored = { to: "Jan", subject: "Offerte", body: "Dag Jan" };
    const { args, changed } = await amendedArguments(letter, harness().deps.ctx, stored, {});
    assert.equal(args, stored);
    assert.deepEqual(changed, []);
  });

  it("checks the confirmation options when a tool registers", () => {
    assert.throws(
      () => registerAssistantTool({ name: "edittest.bad", description: "x", input: z.object({ a: z.string() }), permission: "write", confirm: "always", activity: { en: "x", nl: "x" }, confirmation: { editable: ["nope"] }, run: () => null }),
      /not an argument/,
    );
    assert.throws(
      () => registerAssistantTool({ name: "edittest.read", description: "x", input: z.object({ a: z.string() }), permission: "read", confirm: "never", activity: { en: "x", nl: "x" }, confirmation: { editable: ["a"] }, run: () => null }),
      /only writes/,
    );
  });
});
