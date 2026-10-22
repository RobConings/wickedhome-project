/**
 * Answers that outlive the browser (assistant-runs.ts): replay for a chat that attaches later, the lock, a
 * new conversation found under its id, and errors before the first event. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/assistant-runs.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantStreamEvent } from "@/features/assistant/types/assistant";
import { HttpError } from "@/api/lib/http";
import { findRun, isRunning, startRun, type AssistantRun } from "./assistant-runs";

/** A run whose work waits until `finish()` is called. */
function controllable() {
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { finished, finish: () => finish() };
}

describe("assistant runs", () => {
  it("replays every event so far to a late watcher (text joined), then passes on new ones", async () => {
    const gate = controllable();
    const run = await startRun("c-replay", "u1", async (current) => {
      current.push({ type: "start", conversationId: "c-replay", userMessageId: "m1", title: null });
      current.push({ type: "text", text: "Hal" });
      current.push({ type: "text", text: "lo" });
      await gate.finished;
      current.push({ type: "done", status: "done" });
    });
    const seen: AssistantStreamEvent[] = [];
    const unsubscribe = run.subscribe((event) => seen.push(event));
    assert.deepEqual(
      seen.map((event) => (event.type === "text" ? event.text : event.type)),
      ["start", "Hallo"],
    );
    gate.finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.at(-1)?.type, "done");
    assert.equal(run.finished, true);
    unsubscribe();
  });

  it("one answer at a time per conversation; the run is found only by its owner", async () => {
    const gate = controllable();
    const run = await startRun("c-lock", "u1", async (current) => {
      current.push({ type: "start", conversationId: "c-lock", userMessageId: null, title: null });
      await gate.finished;
      current.push({ type: "done", status: "done" });
    });
    assert.throws(() => startRun("c-lock", "u1", async () => undefined), (error: unknown) => error instanceof HttpError && error.status === 409);
    assert.equal(findRun("c-lock", "u1"), run);
    assert.equal(findRun("c-lock", "someone-else"), null);
    assert.equal(isRunning(run), true);
    gate.finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(isRunning(findRun("c-lock", "u1")), false, "finished, kept briefly for late watchers");
  });

  it("a new conversation is found under its id once it has one", async () => {
    const gate = controllable();
    let current: AssistantRun | null = null;
    await startRun("new:u2", "u2", async (run) => {
      current = run;
      run.push({ type: "start", conversationId: "c-new", userMessageId: "m1", title: "Hoi" });
      await gate.finished;
      run.push({ type: "done", status: "done" });
    });
    assert.equal(findRun("c-new", "u2"), current);
    assert.equal(findRun("new:u2", "u2"), null);
    gate.finish();
  });

  it("an error before the first event rejects (an HTTP error for the route); later ones become events", async () => {
    await assert.rejects(
      startRun("c-early", "u1", async () => {
        throw new HttpError(404, "not_found", "Conversation not found");
      }),
      (error: unknown) => error instanceof HttpError && error.status === 404,
    );
    assert.equal(findRun("c-early", "u1"), null);

    const run = await startRun("c-late", "u1", async (current) => {
      current.push({ type: "start", conversationId: "c-late", userMessageId: null, title: null });
      await new Promise((resolve) => setImmediate(resolve));
      throw new Error("boom");
    });
    const original = console.error;
    console.error = () => undefined;
    await new Promise((resolve) => setTimeout(resolve, 10));
    console.error = original;
    assert.deepEqual(run.events.slice(-2).map((event) => event.type), ["error", "done"]);
  });
});
