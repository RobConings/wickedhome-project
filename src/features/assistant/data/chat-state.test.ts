/**
 * The chat's state from stored messages and stream events (pure). Run on the server:
 *
 *   npx tsx --test src/features/assistant/data/chat-state.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addQuestion, applyEvent, itemsFromMessages, markConfirmation, type ChatItem } from "./chat-state";

describe("chat state", () => {
  it("streams an answer, then a tool chip, a confirmation and its result", () => {
    let items: ChatItem[] = addQuestion([], "Add milk");
    items = applyEvent(items, { type: "text", text: "Su" });
    items = applyEvent(items, { type: "text", text: "re" });
    assert.equal(items.at(-1)?.kind, "assistant");
    items = applyEvent(items, { type: "message", messageId: "a1", role: "assistant" });
    const answer = items.at(-1);
    assert.ok(answer?.kind === "assistant" && answer.text === "Sure" && !answer.streaming && answer.key === "a1");

    items = applyEvent(items, { type: "confirm", messageId: "t1", toolCallId: "c1", name: "shopping.add_item", summary: "Add milk", permission: "write", allowRemember: true });
    items = markConfirmation(items, "t1", "confirm");
    assert.ok(items.at(-1)?.kind === "confirm");
    items = applyEvent(items, { type: "tool", messageId: "t1", toolCallId: "c1", name: "shopping.add_item", status: "running", label: "Added" });
    items = applyEvent(items, { type: "tool", messageId: "t1", toolCallId: "c1", name: "shopping.add_item", status: "done", label: "Added" });
    const chip = items.at(-1);
    assert.ok(chip?.kind === "tool" && chip.status === "done");
    assert.equal(items.filter((item) => item.kind === "tool" || item.kind === "confirm").length, 1, "the card became the chip");
  });

  it("keeps the screen chip on the question as the server found it", () => {
    const screen = { kind: "product", id: "p1", label: "Bacon" };
    let items: ChatItem[] = addQuestion([], "Add this", [], screen);
    assert.deepEqual(items[0]?.kind === "user" && items[0].screen, screen);
    items = applyEvent(items, { type: "start", conversationId: "c1", userMessageId: "q1", title: "Add this", question: { content: "Add this", images: [], screen: { ...screen, label: "Bacon (main)" } } });
    assert.equal(items[0]?.kind === "user" && items[0].screen?.label, "Bacon (main)");
    // Ignored by the server (another household's id, an unknown kind): the chip goes.
    items = applyEvent(addQuestion([], "Add this", [], screen), { type: "start", conversationId: "c1", userMessageId: "q1", title: null, question: { content: "Add this", images: [] } });
    assert.equal(items[0]?.kind === "user" && items[0].screen, undefined);
    const stored = itemsFromMessages([{ id: "m1", role: "user", content: "Add this", createdAt: "2026-10-09T10:00:00Z", screen, tool: null }]);
    assert.deepEqual(stored[0]?.kind === "user" && stored[0].screen, screen);
  });

  it("drops an empty answer bubble of a tool-only message", () => {
    let items: ChatItem[] = applyEvent([], { type: "text", text: "" });
    items = applyEvent(items, { type: "message", messageId: "a1", role: "assistant" });
    assert.equal(items.length, 0);
  });

  it("rebuilds the thread from stored messages, with pending confirmations as cards", () => {
    const items = itemsFromMessages([
      { id: "u1", role: "user", content: "Log 5 euro", createdAt: "", tool: null },
      { id: "t1", role: "tool", content: "", createdAt: "", tool: { name: "expenses.log", status: "pending", summary: "Log € 5,00", permission: "sensitive", allowRemember: false, error: null } },
      { id: "t2", role: "tool", content: "", createdAt: "", tool: { name: "tasks.add", status: "failed", summary: "Added a task", permission: "write", allowRemember: true, error: "No habitant" } },
    ]);
    assert.deepEqual(
      items.map((item) => item.kind),
      ["user", "confirm", "tool"],
    );
  });

  it("ends streaming on an error", () => {
    let items: ChatItem[] = applyEvent([], { type: "text", text: "Half" });
    items = applyEvent(items, { type: "error", code: "timeout", message: "slow" });
    assert.ok(items[0]?.kind === "assistant" && !items[0].streaming);
    assert.equal(items[1]?.kind, "error");
  });

  it("shows a passing status last, replaced or ended by the next event", () => {
    let items: ChatItem[] = addQuestion([], "Tasks today?");
    items = applyEvent(items, { type: "status", code: "queued" });
    assert.ok(items.at(-1)?.kind === "status");
    items = applyEvent(items, { type: "status", code: "restarting" });
    assert.deepEqual(
      items.map((item) => (item.kind === "status" ? item.code : item.kind)),
      ["user", "restarting"],
    );
    items = applyEvent(items, { type: "text", text: "Two" });
    assert.deepEqual(
      items.map((item) => item.kind),
      ["user", "assistant"],
    );
    assert.deepEqual(applyEvent(addQuestion([], "x"), { type: "status", code: null }).map((item) => item.kind), ["user"]);
  });
});
