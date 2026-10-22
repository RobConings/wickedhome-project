import type { AssistantSettings } from "./assistant-config";

/**
 * A small client for an OpenAI-compatible `/chat/completions` endpoint (LM Studio, llama.cpp server,
 * Ollama's /v1, vLLM…): streaming (SSE) with tool calls, timeouts and abort. No SDK: the API surface we
 * need is one POST.
 *
 * The base URL is fixed in `.env` (never user input), and it is usually a LAN address over plain http, so
 * this does not go through `fixedHostFetch` (https-only, public hosts).
 */

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

/** A user message with images: OpenAI content parts, each image as a `data:` URL. */
export type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAiTool = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export type ChatRequest = {
  messages: ChatMessage[];
  /** Left out (or empty): a plain chat without tools. */
  tools?: OpenAiTool[];
  signal: AbortSignal;
  /** Called with each piece of streamed text, as it arrives. */
  onText?: (text: string) => void;
  /**
   * Let the model reason this time even though thinking is off: the loop's rescue when a fast answer went
   * wrong (an empty answer, the same call again and again).
   */
  reasoning?: boolean;
  /**
   * `"none"`: the tools are sent (the conversation still refers to them) but the model must answer in text:
   * the loop's last step, or a model going in circles. Default `"auto"`.
   */
  toolChoice?: "auto" | "none";
};

export type ChatUsage = { promptTokens: number; completionTokens: number };

export type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  /** Token counts, when the server reports them (`stream_options.include_usage`). */
  usage?: ChatUsage | null;
};

const usageOf = (raw: unknown): ChatUsage | null => {
  const usage = raw as { prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined;
  return typeof usage?.prompt_tokens === "number" ? { promptTokens: usage.prompt_tokens, completionTokens: Number(usage.completion_tokens ?? 0) } : null;
};

/**
 * Markup some models stream inside the answer text: Qwen 3 / DeepSeek R1 `<think>…</think>`, the thought
 * blocks of other families (`<thought>…</thought>`, Gemma-style `<|channel>thought…<channel|>`) and raw
 * tool-call syntax.
 * LM Studio usually moves reasoning to `reasoning_content` (ignored here; verified for Gemma 4), so this is
 * the fallback for servers that don't.
 */
export const THINK_TAGS: readonly (readonly [open: string, close: string])[] = [
  ["<think>", "</think>"],
  ["<thought>", "</thought>"],
  ["<|channel>thought", "<channel|>"],
  // Tool-call syntax written as text when no tools were offered (the loop's last step): Gemma 4 writes
  // `<|tool_call>call:name{…}<tool_call|>`, Qwen `<tool_call>{…}</tool_call>`. Never meant for people.
  ["<|tool_call>", "<tool_call|>"],
  ["<tool_call>", "</tool_call>"],
];

/** Hides reasoning blocks (THINK_TAGS) in streamed text, also when the tags are split over chunks. */
export class ThinkFilter {
  /** The closing tag while inside a block. */
  private close: string | null = null;
  private pending = "";

  push(text: string): string {
    let input = this.pending + text;
    this.pending = "";
    let out = "";
    while (input) {
      if (this.close) {
        const index = input.indexOf(this.close);
        if (index >= 0) {
          input = input.slice(index + this.close.length);
          this.close = null;
          continue;
        }
        this.pending = input.slice(input.length - partialSuffix(input, [this.close]));
        input = "";
        continue;
      }
      let first: { index: number; open: string; close: string } | null = null;
      for (const [open, close] of THINK_TAGS) {
        const index = input.indexOf(open);
        if (index >= 0 && (!first || index < first.index)) first = { index, open, close };
      }
      if (first) {
        out += input.slice(0, first.index);
        input = input.slice(first.index + first.open.length);
        this.close = first.close;
        continue;
      }
      // Keep a possible partial tag at the end for the next chunk.
      const keep = partialSuffix(input, THINK_TAGS.map(([open]) => open));
      out += input.slice(0, input.length - keep);
      this.pending = input.slice(input.length - keep);
      input = "";
    }
    return out;
  }

  flush(): string {
    const rest = this.close ? "" : this.pending;
    this.pending = "";
    return rest;
  }
}

/** The length of the longest end of `text` that is the start of one of `tags`. */
function partialSuffix(text: string, tags: string[]): number {
  let best = 0;
  for (const tag of tags) {
    for (let length = Math.min(tag.length - 1, text.length); length > best; length -= 1) {
      if (tag.startsWith(text.slice(-length))) {
        best = length;
        break;
      }
    }
  }
  return best;
}

/** The model, as the tool-call loop sees it. Tests pass a fake. */
export type ChatModel = (request: ChatRequest) => Promise<ChatResult>;

export type ModelErrorCode =
  /** Nothing answered at the URL (PC off, LM Studio not serving on the network, firewall). */
  | "unreachable"
  | "timeout"
  /** The person stopped it (or left). */
  | "aborted"
  /** The server refused the request because of `tools`: the model (or server) has no tool support. */
  | "no_tools"
  /** Any other non-2xx answer, e.g. no such model loaded. */
  | "http"
  | "bad_response";

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export type ModelTimeouts = {
  /**
   * Until the first streamed chunk: generous, the server first reads the whole prompt (a 27B model partly on
   * the CPU: ~10k tokens in 165 s, LM Studio log 2026-10-09) and may have to load the model. The response
   * headers don't count: LM Studio sends them before it starts reading.
   */
  firstByteMs: number;
  /** Silence between two streamed chunks: a server that hangs mid-answer. */
  idleMs: number;
  /** The whole answer; `null` = no limit (the idle timer and the person's stop cover a hung server). */
  totalMs: number | null;
};

export const DEFAULT_TIMEOUTS: ModelTimeouts = { firstByteMs: 300_000, idleMs: 60_000, totalMs: null };

const headersOf = (settings: Pick<AssistantSettings, "apiKey">): Record<string, string> => ({
  "Content-Type": "application/json",
  Accept: "text/event-stream, application/json",
  ...(settings.apiKey && { Authorization: `Bearer ${settings.apiKey}` }),
});

/** Merges streamed tool-call fragments (by `index`) into whole calls. */
export class ToolCallAccumulator {
  private readonly calls = new Map<number, { id: string; name: string; arguments: string }>();

  add(fragments: unknown): void {
    if (!Array.isArray(fragments)) return;
    for (const raw of fragments) {
      const fragment = raw as { index?: number; id?: string; function?: { name?: string; arguments?: string } };
      const index = typeof fragment.index === "number" ? fragment.index : this.calls.size;
      const call = this.calls.get(index) ?? { id: "", name: "", arguments: "" };
      if (fragment.id) call.id = fragment.id;
      if (fragment.function?.name) call.name += fragment.function.name;
      if (typeof fragment.function?.arguments === "string") call.arguments += fragment.function.arguments;
      else if (fragment.function?.arguments && typeof fragment.function.arguments === "object") {
        call.arguments += JSON.stringify(fragment.function.arguments);
      }
      this.calls.set(index, call);
    }
  }

  result(): ToolCall[] {
    return [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name)
      .map(([index, call]) => ({
        id: call.id || `call_${index}_${Math.random().toString(36).slice(2, 10)}`,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments || "{}" },
      }));
  }
}

/** Splits an SSE byte stream into the `data:` payloads of its events. */
export async function* sseData(body: ReadableStream<Uint8Array>, onChunk?: () => void): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    onChunk?.();
    buffer += decoder.decode(chunk, { stream: true });
    let boundary: number;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) yield data;
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith("data:")) yield rest.slice(5).trim();
}

function looksLikeNoToolSupport(status: number, body: string): boolean {
  return [400, 422, 500, 501].includes(status) && /tool|function/i.test(body);
}

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/**
 * One abort signal for the person's stop, the total time, and the first-byte / idle timers. `timedOut()` says
 * which limit fired and after how long, for the log ("no output within 300 s, after 300 s").
 */
function timers(outer: AbortSignal, timeouts: ModelTimeouts) {
  const controller = new AbortController();
  const started = Date.now();
  let reason: string | null = null;
  const fire = (why: string) => () => {
    reason = `${why}, after ${seconds(Date.now() - started)}`;
    controller.abort();
  };
  const total = timeouts.totalMs === null ? undefined : setTimeout(fire(`over ${seconds(timeouts.totalMs)} in total`), timeouts.totalMs);
  let idle = setTimeout(fire(`no output within ${seconds(timeouts.firstByteMs)}`), timeouts.firstByteMs);
  const onAbort = () => controller.abort();
  outer.addEventListener("abort", onAbort, { once: true });
  if (outer.aborted) controller.abort();
  return {
    signal: controller.signal,
    /** A streamed chunk arrived: from now on only silence counts. */
    touch() {
      clearTimeout(idle);
      idle = setTimeout(fire(`silent for ${seconds(timeouts.idleMs)}`), timeouts.idleMs);
    },
    timedOut: () => reason,
    done() {
      clearTimeout(total);
      clearTimeout(idle);
      outer.removeEventListener("abort", onAbort);
    },
  };
}

/** The model behind `settings` as a `ChatModel`. */
export function createOpenAiChatModel(
  settings: Pick<AssistantSettings, "baseUrl" | "model" | "apiKey"> & { thinking?: boolean; timeouts?: ModelTimeouts },
  timeouts: ModelTimeouts = settings.timeouts ?? DEFAULT_TIMEOUTS,
): ChatModel {
  // Reasoning makes a local model several times slower; household questions don't need it. Two switches,
  // because servers differ: `chat_template_kwargs.enable_thinking` (llama.cpp, vLLM; Qwen 3 templates) and
  // `reasoning_effort: "none"` (LM Studio: the only switch Gemma 4 honours there, measured 2026-10-04: one
  // answer 1.6 s → 0.25 s). A server that refuses `reasoning_effort` gets the request again without it,
  // and never again from this model instance.
  let sendEffort = settings.thinking === false;
  return async ({ messages, tools, signal, onText, reasoning, toolChoice = "auto" }) => {
    const thinkingOff = settings.thinking === false && !reasoning;
    if (!settings.baseUrl || !settings.model) throw new ModelError("unreachable", "The assistant is not configured");
    const clock = timers(signal, timeouts);
    const fail = (error: unknown): never => {
      if (error instanceof ModelError) throw error;
      if (signal.aborted) throw new ModelError("aborted", "Stopped");
      const late = clock.timedOut();
      if (late) throw new ModelError("timeout", `The model took too long to answer (${late})`);
      throw new ModelError("unreachable", "The model server could not be reached");
    };
    try {
      const post = () =>
        fetch(`${settings.baseUrl}/chat/completions`, {
          method: "POST",
          headers: headersOf(settings),
          redirect: "error",
          signal: clock.signal,
          body: JSON.stringify({
            model: settings.model,
            messages,
            stream: true,
            stream_options: { include_usage: true },
            temperature: 0.3,
            ...(tools?.length && { tools, tool_choice: toolChoice }),
            ...(thinkingOff && { chat_template_kwargs: { enable_thinking: false } }),
            ...(thinkingOff && sendEffort && { reasoning_effort: "none" }),
          }),
        });
      let response: Response;
      try {
        response = await post();
        if (thinkingOff && sendEffort && (response.status === 400 || response.status === 422)) {
          const text = await response.clone().text().catch(() => "");
          if (/reasoning/i.test(text)) {
            sendEffort = false;
            response = await post();
          }
        }
      } catch (error) {
        return fail(error);
      }
      // No `clock.touch()` for the headers: the server sends them before reading the prompt, which is the
      // slow part; the idle timer starts at the first streamed chunk (sseData).
      if (!response.ok) {
        const text = (await response.text().catch(() => "")).slice(0, 2000);
        if (tools?.length && looksLikeNoToolSupport(response.status, text)) {
          throw new ModelError("no_tools", "The model does not support tools", response.status);
        }
        const message = (() => {
          try {
            const parsed = JSON.parse(text) as { error?: { message?: string } | string };
            return typeof parsed.error === "string" ? parsed.error : (parsed.error?.message ?? text);
          } catch {
            return text;
          }
        })();
        throw new ModelError("http", `The model server answered ${response.status}: ${message.slice(0, 300)}`, response.status);
      }

      const type = response.headers.get("content-type") ?? "";
      // Some servers ignore `stream` and answer with one JSON body.
      if (!type.includes("text/event-stream")) {
        const json = (await response.json().catch(() => null)) as {
          choices?: { message?: { content?: string | null; tool_calls?: unknown }; finish_reason?: string }[];
          usage?: unknown;
        } | null;
        const choice = json?.choices?.[0];
        if (!choice?.message) throw new ModelError("bad_response", "The model server sent an unexpected answer");
        const calls = new ToolCallAccumulator();
        calls.add(choice.message.tool_calls);
        const filter = new ThinkFilter();
        const content = (filter.push(choice.message.content ?? "") + filter.flush()).trim();
        if (content) onText?.(content);
        return { content, toolCalls: calls.result(), finishReason: choice.finish_reason ?? null, usage: usageOf(json?.usage) };
      }
      if (!response.body) throw new ModelError("bad_response", "The model server sent an empty answer");

      let content = "";
      let finishReason: string | null = null;
      let usage: ChatUsage | null = null;
      const calls = new ToolCallAccumulator();
      const filter = new ThinkFilter();
      // Leading whitespace after a hidden reasoning block is not shown.
      const show = (text: string) => {
        const piece = content ? text : text.trimStart();
        if (!piece) return;
        content += piece;
        onText?.(piece);
      };
      try {
        for await (const data of sseData(response.body, () => clock.touch())) {
          if (data === "[DONE]") break;
          let chunk: { choices?: { delta?: { content?: string | null; tool_calls?: unknown }; finish_reason?: string | null }[]; error?: unknown; usage?: unknown };
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          if (chunk.error) {
            const message = typeof chunk.error === "string" ? chunk.error : JSON.stringify(chunk.error);
            throw new ModelError("http", `The model failed: ${message.slice(0, 300)}`);
          }
          usage = usageOf(chunk.usage) ?? usage;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const text = choice.delta?.content;
          if (text) show(filter.push(text));
          calls.add(choice.delta?.tool_calls);
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
      } catch (error) {
        return fail(error);
      }
      show(filter.flush());
      return { content, toolCalls: calls.result(), finishReason, usage };
    } finally {
      clock.done();
    }
  };
}

export type ModelProbe = {
  reachable: boolean;
  /** Round trip of a one-token answer, ms. */
  latencyMs: number | null;
  /** Models the server lists (`GET /models`), when it answers. */
  models: string[];
  /** The configured model is among them (`null`: the server didn't list any). */
  modelListed: boolean | null;
  error: string | null;
};

/** The card's "Test": list the models and time a one-token answer. Never throws. */
export async function probeModel(settings: Pick<AssistantSettings, "baseUrl" | "model" | "apiKey">, timeoutMs = 60_000): Promise<ModelProbe> {
  const result: ModelProbe = { reachable: false, latencyMs: null, models: [], modelListed: null, error: null };
  if (!settings.baseUrl) return { ...result, error: "Not configured" };
  try {
    const response = await fetch(`${settings.baseUrl}/models`, {
      headers: headersOf(settings),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    result.reachable = true;
    if (response.ok) {
      const json = (await response.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      result.models = (json?.data ?? []).flatMap((model) => (typeof model.id === "string" ? [model.id] : [])).slice(0, 50);
      result.modelListed = result.models.length ? result.models.includes(settings.model ?? "") : null;
    }
  } catch {
    return { ...result, error: "The model server could not be reached" };
  }
  if (!settings.model) return { ...result, error: "No model set" };
  const started = Date.now();
  try {
    const model = createOpenAiChatModel(settings, { firstByteMs: timeoutMs, idleMs: timeoutMs, totalMs: timeoutMs });
    await model({ messages: [{ role: "user", content: "Reply with: ok" }], signal: AbortSignal.timeout(timeoutMs) });
    result.latencyMs = Date.now() - started;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "The model did not answer";
  }
  return result;
}
