/**
 * The model queue: one call at a time, chats before background work, and one retry when the engine went away.
 * No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/model-queue.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModelError, type ChatModel, type ChatResult } from "./llm-client";
import { acquireModelSlot, isEngineGone, modelQueueState, queuedModel, setModelConcurrency, type ModelQueueStatus } from "./model-queue";

const answer = (content: string): ChatResult => ({ content, toolCalls: [], finishReason: "stop" });
const signal = () => new AbortController().signal;
const request = (overrides: Partial<Parameters<ChatModel>[0]> = {}) => ({ messages: [{ role: "user" as const, content: "Hi" }], signal: signal(), ...overrides });
const engineGone = () => new ModelError("http", 'The model failed: {"message":"Engine protocol predict request failed: fetch failed"}');

describe("model queue", () => {
  it("runs one call at a time and the next when it ends", async () => {
    setModelConcurrency(1);
    const order: string[] = [];
    let finishFirst: () => void = () => undefined;
    const slow: ChatModel = () => new Promise((resolve) => (finishFirst = () => resolve(answer("first"))));
    const first = queuedModel(slow, { priority: "chat" })(request());
    const statuses: ModelQueueStatus[] = [];
    const second = queuedModel(async () => answer("second"), { priority: "chat", onStatus: (status) => statuses.push(status) })(request());
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(modelQueueState(), { running: 1, waiting: 1, limit: 1 });
    finishFirst();
    order.push((await first).content, (await second).content);
    assert.deepEqual(order, ["first", "second"]);
    assert.deepEqual(statuses, ["queued", null]);
    assert.deepEqual(modelQueueState(), { running: 0, waiting: 0, limit: 1 });
  });

  it("lets a chat go before background work that waited longer", async () => {
    setModelConcurrency(1);
    const release = await acquireModelSlot("chat", signal());
    const order: string[] = [];
    const background = acquireModelSlot("background", signal()).then((done) => (order.push("background"), done()));
    const chat = acquireModelSlot("chat", signal()).then((done) => (order.push("chat"), done()));
    release();
    await Promise.all([background, chat]);
    assert.deepEqual(order, ["chat", "background"]);
  });

  it("leaves the queue when the person stops while waiting", async () => {
    setModelConcurrency(1);
    const release = await acquireModelSlot("chat", signal());
    const controller = new AbortController();
    const waiting = acquireModelSlot("chat", controller.signal);
    controller.abort();
    await assert.rejects(waiting, (error: unknown) => error instanceof ModelError && error.code === "aborted");
    assert.equal(modelQueueState().waiting, 0);
    release();
    assert.equal(modelQueueState().running, 0);
  });

  it("tries once more when the engine went away, and says so", async () => {
    let calls = 0;
    const flaky: ChatModel = async () => {
      calls += 1;
      if (calls === 1) throw engineGone();
      return answer("ok");
    };
    const statuses: ModelQueueStatus[] = [];
    const result = await queuedModel(flaky, { priority: "chat", retryDelayMs: 1, onStatus: (status) => statuses.push(status) })(request());
    assert.equal(result.content, "ok");
    assert.equal(calls, 2);
    assert.deepEqual(statuses, ["restarting", null]);
  });

  it("gives up after the one retry", async () => {
    let calls = 0;
    const dead: ChatModel = async () => {
      calls += 1;
      throw engineGone();
    };
    await assert.rejects(queuedModel(dead, { priority: "chat", retryDelayMs: 1 })(request()), (error: unknown) => isEngineGone(error));
    assert.equal(calls, 2);
    assert.equal(modelQueueState().running, 0);
  });

  it("never retries once text was shown, or a refused request", async () => {
    let calls = 0;
    const halfway: ChatModel = async ({ onText }) => {
      calls += 1;
      onText?.("Hal");
      throw engineGone();
    };
    await assert.rejects(queuedModel(halfway, { priority: "chat", retryDelayMs: 1 })(request({ onText: () => undefined })));
    assert.equal(calls, 1);
    const schema = new ModelError("http", 'The model failed: {"message":"Engine protocol predict request returned 500: JSON schema error"}');
    assert.equal(isEngineGone(schema), false);
    assert.equal(isEngineGone(new ModelError("unreachable", "The model server could not be reached")), true);
    assert.equal(isEngineGone(new ModelError("timeout", "The model took too long to answer")), false);
  });
});
