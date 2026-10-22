/**
 * The OpenAI-compatible client against a tiny local server: streamed text, tool calls in fragments, a
 * non-streamed answer, "no tool support", timeouts and settings. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/llm-client.test.ts
 */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { normaliseBaseUrl, readAssistantSettings } from "./assistant-config";
import { ModelError, createOpenAiChatModel, probeModel } from "./llm-client";

type Handler = (body: Record<string, unknown>, res: ServerResponse) => void;
let handler: Handler = () => undefined;
let baseUrl = "";

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "fake-model" }] }));
      return;
    }
    handler(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}, res);
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(() => server.close());

const sse = (res: ServerResponse, chunks: unknown[]) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end("data: [DONE]\n\n");
};
const settings = () => ({ baseUrl, model: "fake-model", apiKey: null });
const signal = () => new AbortController().signal;

describe("createOpenAiChatModel", () => {
  it("streams text", async () => {
    handler = (body, res) => {
      assert.equal(body.stream, true);
      assert.equal(body.model, "fake-model");
      sse(res, [{ choices: [{ delta: { content: "Hel" } }] }, { choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] }]);
    };
    const pieces: string[] = [];
    const result = await createOpenAiChatModel(settings())({ messages: [{ role: "user", content: "Hi" }], signal: signal(), onText: (text) => pieces.push(text) });
    assert.equal(result.content, "Hello");
    assert.deepEqual(pieces, ["Hel", "lo"]);
    assert.equal(result.finishReason, "stop");
  });

  it("hides <think> reasoning split over chunks and reports usage", async () => {
    handler = (body, res) => {
      assert.deepEqual(body.stream_options, { include_usage: true });
      sse(res, [
        { choices: [{ delta: { content: "<thi" } }] },
        { choices: [{ delta: { content: "nk>let me think</th" } }] },
        { choices: [{ delta: { content: "ink>\n\nHallo" } }] },
        { choices: [{ delta: { content: " Rob" }, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 1234, completion_tokens: 5 } },
      ]);
    };
    const pieces: string[] = [];
    const result = await createOpenAiChatModel(settings())({ messages: [{ role: "user", content: "Hi" }], signal: signal(), onText: (text) => pieces.push(text) });
    assert.equal(result.content, "Hallo Rob");
    assert.equal(pieces.join(""), "Hallo Rob");
    assert.deepEqual(result.usage, { promptTokens: 1234, completionTokens: 5 });
  });

  it("asks the server not to reason when thinking is off", async () => {
    handler = (body, res) => {
      assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
      assert.equal(body.reasoning_effort, "none");
      sse(res, [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]);
    };
    await createOpenAiChatModel({ ...settings(), thinking: false })({ messages: [{ role: "user", content: "Hi" }], signal: signal() });
    // Thinking on: neither switch is sent.
    handler = (body, res) => {
      assert.equal(body.chat_template_kwargs, undefined);
      assert.equal(body.reasoning_effort, undefined);
      sse(res, [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]);
    };
    await createOpenAiChatModel({ ...settings(), thinking: true })({ messages: [{ role: "user", content: "Hi" }], signal: signal() });
    // The loop's rescue: reasoning for this one request although thinking is off.
    await createOpenAiChatModel({ ...settings(), thinking: false })({ messages: [{ role: "user", content: "Hi" }], signal: signal(), reasoning: true });
  });

  it("asks again without reasoning_effort when the server refuses it, and remembers that", async () => {
    const seen: unknown[] = [];
    handler = (body, res) => {
      seen.push(body.reasoning_effort);
      if (body.reasoning_effort) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "reasoning_effort: Input should be 'low', 'medium' or 'high'" } }));
        return;
      }
      sse(res, [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]);
    };
    const model = createOpenAiChatModel({ ...settings(), thinking: false });
    assert.equal((await model({ messages: [{ role: "user", content: "Hi" }], signal: signal() })).content, "ok");
    assert.equal((await model({ messages: [{ role: "user", content: "Hi" }], signal: signal() })).content, "ok");
    assert.deepEqual(seen, ["none", undefined, undefined]);
  });

  it("ignores reasoning sent separately and hides other models' thought markup", async () => {
    handler = (_body, res) => {
      sse(res, [
        { choices: [{ delta: { role: "assistant", reasoning_content: "The user asks two things…" } }] },
        { choices: [{ delta: { content: "<|channel>thought\nplan<chan" } }] },
        { choices: [{ delta: { content: "nel|>Morgen " } }] },
        { choices: [{ delta: { content: "<thought>x</thought>regent het." } }] },
        // Gemma 4 writes its tool-call syntax as text when no tools were offered.
        { choices: [{ delta: { content: "<|tool_call>call:tasks_list_open{filter:<|\"|>all<|\"|>}<tool_" } }] },
        { choices: [{ delta: { content: "call|>" }, finish_reason: "stop" }] },
      ]);
    };
    const pieces: string[] = [];
    const result = await createOpenAiChatModel(settings())({ messages: [{ role: "user", content: "Hi" }], signal: signal(), onText: (text) => pieces.push(text) });
    assert.equal(result.content, "Morgen regent het.");
    assert.equal(pieces.join(""), "Morgen regent het.");
  });

  it("merges tool-call fragments", async () => {
    handler = (body, res) => {
      assert.ok(Array.isArray(body.tools));
      sse(res, [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "shopping_list", arguments: "" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }, { index: 1, id: "call_2", function: { name: "weather_forecast", arguments: "{}" } }] } }] },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]);
    };
    const tools = [{ type: "function" as const, function: { name: "shopping_list", description: "x", parameters: { type: "object" } } }];
    const result = await createOpenAiChatModel(settings())({ messages: [{ role: "user", content: "Hi" }], tools, signal: signal() });
    assert.deepEqual(
      result.toolCalls.map((call) => [call.id, call.function.name, call.function.arguments]),
      [
        ["call_1", "shopping_list", '{"a":1}'],
        ["call_2", "weather_forecast", "{}"],
      ],
    );
  });

  it("accepts a non-streamed JSON answer", async () => {
    handler = (_body, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "Plain" }, finish_reason: "stop" }] }));
    };
    const result = await createOpenAiChatModel(settings())({ messages: [{ role: "user", content: "Hi" }], signal: signal() });
    assert.equal(result.content, "Plain");
  });

  it("recognises a refusal of tools", async () => {
    handler = (_body, res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "This model does not support tools" } }));
    };
    const tools = [{ type: "function" as const, function: { name: "x_y", description: "x", parameters: { type: "object" } } }];
    await assert.rejects(createOpenAiChatModel(settings())({ messages: [{ role: "user", content: "Hi" }], tools, signal: signal() }), (error: unknown) => {
      return error instanceof ModelError && error.code === "no_tools";
    });
  });

  it("times out when nothing comes back", async () => {
    handler = () => undefined; // never answers
    const model = createOpenAiChatModel(settings(), { firstByteMs: 100, idleMs: 100, totalMs: 1000 });
    await assert.rejects(model({ messages: [{ role: "user", content: "Hi" }], signal: signal() }), (error: unknown) => error instanceof ModelError && error.code === "timeout");
  });

  it("gives prompt reading the first-byte time, not the idle time (headers come first)", async () => {
    // LM Studio sends the headers at once and the first chunk only after reading the prompt.
    handler = (_body, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.flushHeaders();
      setTimeout(() => {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }, 250);
    };
    const model = createOpenAiChatModel(settings(), { firstByteMs: 1000, idleMs: 100, totalMs: null });
    const result = await model({ messages: [{ role: "user", content: "Hi" }], signal: signal() });
    assert.equal(result.content, "ok");
  });

  it("names the limit that fired", async () => {
    handler = (_body, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`); // then silence
    };
    const model = createOpenAiChatModel(settings(), { firstByteMs: 1000, idleMs: 100, totalMs: null });
    await assert.rejects(model({ messages: [{ role: "user", content: "Hi" }], signal: signal() }), (error: unknown) => {
      return error instanceof ModelError && error.code === "timeout" && /silent for 0 s/.test(error.message);
    });
  });

  it("reports an unreachable server", async () => {
    const model = createOpenAiChatModel({ baseUrl: "http://127.0.0.1:1/v1", model: "x", apiKey: null });
    await assert.rejects(model({ messages: [{ role: "user", content: "Hi" }], signal: signal() }), (error: unknown) => error instanceof ModelError && error.code === "unreachable");
  });

  it("probes the server: models and a round trip", async () => {
    handler = (_body, res) => sse(res, [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]);
    const probe = await probeModel(settings());
    assert.equal(probe.reachable, true);
    assert.deepEqual(probe.models, ["fake-model"]);
    assert.equal(probe.modelListed, true);
    assert.equal(typeof probe.latencyMs, "number");
    assert.equal(probe.error, null);
  });
});

describe("settings", () => {
  it("normalises the base URL and reports what is missing", () => {
    assert.equal(normaliseBaseUrl("http://192.168.1.20:1234/v1/"), "http://192.168.1.20:1234/v1");
    assert.equal(normaliseBaseUrl("http://192.168.1.20:1234"), "http://192.168.1.20:1234/v1");
    assert.equal(normaliseBaseUrl("http://192.168.1.20:1234/"), "http://192.168.1.20:1234/v1");
    assert.equal(normaliseBaseUrl("ftp://x"), null);
    assert.equal(normaliseBaseUrl("not a url"), null);
    assert.equal(readAssistantSettings({}).problem, "missing_url");
    assert.equal(readAssistantSettings({ ASSISTANT_BASE_URL: "nope" }).problem, "invalid_url");
    assert.equal(readAssistantSettings({ ASSISTANT_BASE_URL: "http://a:1/v1" }).problem, "missing_model");
    assert.equal(readAssistantSettings({ ASSISTANT_BASE_URL: "http://a:1/v1", ASSISTANT_MODEL: "m" }).problem, null);
  });

  it("reads the timeouts in seconds, with defaults and no total limit", () => {
    assert.deepEqual(readAssistantSettings({}).timeouts, { firstByteMs: 300_000, idleMs: 60_000, totalMs: null });
    assert.deepEqual(readAssistantSettings({ ASSISTANT_TIMEOUT_FIRST_BYTE: "600", ASSISTANT_TIMEOUT_IDLE: "90", ASSISTANT_TIMEOUT_TOTAL: "900" }).timeouts, {
      firstByteMs: 600_000,
      idleMs: 90_000,
      totalMs: 900_000,
    });
    assert.deepEqual(readAssistantSettings({ ASSISTANT_TIMEOUT_FIRST_BYTE: "soon", ASSISTANT_TIMEOUT_TOTAL: "0" }).timeouts, { firstByteMs: 300_000, idleMs: 60_000, totalMs: null });
  });
});
