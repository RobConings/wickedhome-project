import { ChatGptAuthError } from "./chatgpt-oauth";
import { DEFAULT_TIMEOUTS, ModelError, ThinkFilter, sseData, timers, type ChatModel, type ChatRequest, type ToolCall } from "../llm-client";

/** Only allow documented subscription-sharing fields. The existing loop stays provider independent. */
export function responsesBody(request: ChatRequest, model: string) {
  const input: unknown[] = [];
  const instructions: string[] = [];
  for (const message of request.messages) {
    if (message.role === "system") { instructions.push(message.content); continue; }
    if (message.role === "tool") { input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content }); continue; }
    if (message.role === "assistant") {
      if (message.content) input.push({ role: "assistant", content: message.content });
      for (const call of message.tool_calls ?? []) input.push({ type: "function_call", namespace: "wickedhome", name: call.function.name, call_id: call.id, arguments: call.function.arguments });
    } else input.push({ role: "user", content: typeof message.content === "string" ? message.content : message.content.map((part) => part.type === "text" ? { type: "input_text", text: part.text } : { type: "input_image", image_url: part.image_url.url }) });
  }
  return { model, instructions: instructions.join("\n\n"), input, store: false, stream: true,
    ...(request.tools?.length && { tools: [{ type: "namespace", name: "wickedhome", description: "WickedHome household tools. Writes require existing application confirmation.", tools: request.tools.map(({ function: tool }) => ({ type: "function", ...tool, strict: false })) }], tool_choice: request.toolChoice ?? "auto" }),
  };
}
export class ResponsesError extends ModelError {
  constructor(readonly providerCode: string, status: number | null, readonly requestId: string | null, readonly param: string | null = null, readonly bodyShape: "error" | "detail" | "other" = "error") {
    super("provider", providerCode, status);
  }
}
export function createResponsesModel(model: string, accessToken: () => Promise<string>, fetcher: typeof fetch = fetch): ChatModel {
  return async (request) => {
    const timer = timers(request.signal, DEFAULT_TIMEOUTS);
    try {
      const token = await accessToken();
      const response = await fetcher("https://api.openai.com/v1/responses", { method: "POST", redirect: "error", signal: timer.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(responsesBody(request, model)) });
      const requestId = response.headers.get("x-request-id");
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string; param?: string }; detail?: string } | null;
        throw new ResponsesError(body?.error?.code ?? `chatgpt_http_${response.status}`, response.status, requestId, body?.error?.param ?? null, body?.error ? "error" : body?.detail ? "detail" : "other");
      }
      if (!response.body) throw new ModelError("bad_response", "ChatGPT returned no stream");
      let content = "";
      const filter = new ThinkFilter();
      for await (const data of sseData(response.body, timer.touch)) {
        if (data === "[DONE]") continue;
        const event = JSON.parse(data) as { type: string; delta?: string; error?: { code?: string; param?: string }; code?: string; response?: { status?: string; error?: { code?: string; param?: string }; incomplete_details?: { reason?: string }; output?: { type: string; namespace?: string; name?: string; call_id?: string; arguments?: string }[]; usage?: { input_tokens: number; output_tokens: number } } };
        if (event.type === "response.output_text.delta" && event.delta) {
          const text = filter.push(event.delta); content += text; if (text) request.onText?.(text);
        }
        if (event.type === "response.failed" || event.type === "error") throw new ResponsesError(event.response?.error?.code ?? event.error?.code ?? event.code ?? "response_failed", response.status, requestId, event.response?.error?.param ?? event.error?.param ?? null);
        if (event.type === "response.incomplete") throw new ModelError("incomplete", `ChatGPT response incomplete: ${event.response?.incomplete_details?.reason ?? "unknown"}`);
        if (event.type === "response.completed") {
          const rest = filter.flush(); content += rest; if (rest) request.onText?.(rest);
          const toolCalls: ToolCall[] = [];
          for (const item of event.response?.output ?? []) {
            if (item.type !== "function_call") continue;
            if (!item.call_id || !item.name || (item.namespace && item.namespace !== "wickedhome")) throw new ModelError("bad_response", "Invalid ChatGPT tool call");
            toolCalls.push({ id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments ?? "{}" } });
          }
          return { content, toolCalls, finishReason: "stop", usage: event.response?.usage ? { promptTokens: event.response.usage.input_tokens, completionTokens: event.response.usage.output_tokens } : null };
        }
      }
      throw new ModelError("interrupted", "ChatGPT stream ended before completion");
    } catch (error) {
      if (request.signal.aborted) throw new ModelError("aborted", "Stopped");
      if (timer.timedOut()) throw new ModelError("timeout", "ChatGPT timed out");
      if (error instanceof ModelError) throw error;
      if (error instanceof ChatGptAuthError) throw new ResponsesError(error.code, error.status, null);
      throw new ModelError("unreachable", "ChatGPT could not be reached; check the connection in AI settings");
    } finally { timer.done(); }
  };
}
