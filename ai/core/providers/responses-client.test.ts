import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createResponsesModel, responsesBody, ResponsesError } from "./responses-client";
import { ModelError, type ChatRequest } from "../llm-client";
const request = (): ChatRequest => ({ messages: [{ role: "system", content: "Household instructions" }, { role: "user", content: "Hi" }], signal: new AbortController().signal });
const stream = (events: unknown[]) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""), { headers: { "Content-Type": "text/event-stream", "x-request-id": "req-test" } });
const fetchEvents = (events: unknown[]): typeof fetch => async () => stream(events);
describe("ChatGPT Responses provider", () => {
  it("sends explicit text, images and function-call history, with only allowed fields", () => {
    const req = request();
    req.messages.push({ role: "user", content: [{ type: "text", text: "Photo" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] }, { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "shopping_list", arguments: "{}" } }] }, { role: "tool", tool_call_id: "call-1", content: '{"ok":true}' });
    req.tools = [{ type: "function", function: { name: "shopping_list", description: "List", parameters: { type: "object", properties: {} } } }];
    const body = responsesBody(req, "account-model");
    assert.equal(body.store, false); assert.equal(body.stream, true);
    assert.equal(body.instructions, "Household instructions");
    assert.equal(body.tools?.[0]?.type, "namespace");
    assert.deepEqual(body.input.at(-1), { type: "function_call_output", call_id: "call-1", output: '{"ok":true}' });
    assert.deepEqual(body.input[2], { type: "function_call", namespace: "wickedhome", call_id: "call-1", name: "shopping_list", arguments: "{}" });
    for (const key of ["temperature", "max_output_tokens", "previous_response_id", "conversation", "metadata", "stream_options", "reasoning_effort"]) assert.equal(key in body, false);
    assert.ok(!JSON.stringify(body.input).includes('"role":"system"'));
  });
  it("streams visible text, ignores reasoning, and executes only completed tool calls", async () => {
    const pieces: string[] = [];
    const model = createResponsesModel("available", async () => "oauth-token", fetchEvents([
      { type: "response.reasoning_text.delta", delta: "secret reasoning" },
      { type: "response.output_text.delta", delta: "Hello " }, { type: "response.output_text.delta", delta: "there" },
      { type: "response.completed", response: { output: [{ type: "function_call", namespace: "wickedhome", name: "shopping_list", call_id: "c1", arguments: "{}" }], usage: { input_tokens: 10, output_tokens: 2 } } },
    ]));
    const result = await model({ ...request(), onText: (text) => pieces.push(text) });
    assert.deepEqual(pieces, ["Hello ", "there"]); assert.equal(result.content, "Hello there");
    assert.equal(result.toolCalls[0]?.function.name, "shopping_list"); assert.equal(result.usage?.promptTokens, 10);
  });
  it("sends the OAuth bearer only to the public Responses endpoint", async () => {
    const fetcher: typeof fetch = async (url, init) => { assert.equal(url, "https://api.openai.com/v1/responses"); assert.equal((init?.headers as Record<string,string>).Authorization, "Bearer subscription-token"); assert.equal(init?.redirect, "error"); return stream([{ type: "response.completed", response: { output: [] } }]); };
    await createResponsesModel("available", async () => "subscription-token", fetcher)(request());
  });
  it("rejects a usage failure after text has already streamed", async () => {
    const pieces: string[] = [];
    const model = createResponsesModel("available", async () => "token", fetchEvents([{ type: "response.output_text.delta", delta: "Partial" }, { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded", param: "model" } } }]));
    await assert.rejects(model({ ...request(), onText: (text) => pieces.push(text) }), (error: unknown) => error instanceof ResponsesError && error.providerCode === "subscription_sharing_usage_limit_exceeded" && error.requestId === "req-test" && error.param === "model");
    assert.deepEqual(pieces, ["Partial"]);
  });
  for (const [name, events, code] of [["incomplete", [{ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }], "incomplete"], ["interrupted", [{ type: "response.output_text.delta", delta: "Partial" }], "interrupted"]] as const) {
    it(`distinguishes ${name} from completion`, async () => {
      await assert.rejects(createResponsesModel("available", async () => "token", fetchEvents([...events]))(request()), (e: unknown) => e instanceof ModelError && e.code === code);
    });
  }
  it("retains admission status, shape and request ID without exposing diagnostic text", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ detail: "private diagnostic" }), { status: 403, headers: { "x-request-id": "req-policy" } });
    await assert.rejects(createResponsesModel("available", async () => "token", fetcher)(request()), (e: unknown) => e instanceof ResponsesError && e.status === 403 && e.bodyShape === "detail" && e.requestId === "req-policy" && !e.message.includes("private"));
  });
  it("honors stop and does not retry inference", async () => {
    const controller = new AbortController(); controller.abort(); let requests = 0;
    const fetcher: typeof fetch = async (_url, init) => { requests++; init?.signal?.throwIfAborted(); throw new Error("unreachable"); };
    await assert.rejects(createResponsesModel("available", async () => "token", fetcher)({ ...request(), signal: controller.signal }), (e: unknown) => e instanceof ModelError && e.code === "aborted"); assert.equal(requests, 1);
  });
});
