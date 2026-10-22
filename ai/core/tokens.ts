/**
 * Token estimates for budgeting the prompt of a local model (Qwen-class, ~16k context). No tokenizer: for
 * mixed Dutch/English text and compact JSON, ~3.5 characters per token is close enough to keep the prompt
 * inside its budget and to compare before/after. The model's own count (`usage.prompt_tokens`, when the
 * server sends it) is logged next to it.
 */

const CHARS_PER_TOKEN = 3.5;

export const estimateTokens = (text: string | null | undefined): number => (text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0);

export const estimateJsonTokens = (value: unknown): number => estimateTokens(JSON.stringify(value ?? null));

/**
 * An attached image, whatever its size: vision models turn an image into a fixed budget of tokens (Gemma 4
 * in LM Studio: ~500 for a 2048 px image), never its base64 length.
 */
export const IMAGE_TOKENS = 600;

/** A chat message's estimate; images (`image_url` parts) count as `IMAGE_TOKENS` each. */
export function estimateMessageTokens(message: object): number {
  const content: unknown = "content" in message ? message.content : null;
  if (!Array.isArray(content)) return estimateJsonTokens(message);
  const isImage = (part: unknown) => (part as { type?: unknown } | null)?.type === "image_url";
  const images = content.filter(isImage).length;
  const rest = { ...message, content: content.filter((part) => !isImage(part)) };
  return estimateJsonTokens(rest) + images * IMAGE_TOKENS;
}

/**
 * The prompt's budget, in estimated tokens, for a ~16k context window: the rest is the answer and slack.
 * history is trimmed (oldest turns first) to stay inside its share.
 */
export const PROMPT_BUDGET = {
  /** Base rules + skill index + snapshot + loaded guides. */
  system: 2600,
  /** Function definitions sent with the request. */
  tools: 3000,
  /** Earlier messages and this turn's tool results. */
  history: 5000,
} as const;

export type PromptMeasure = {
  step: number;
  systemTokens: number;
  toolsTokens: number;
  historyTokens: number;
  totalTokens: number;
  toolCount: number;
  skills: string[];
  /** As counted by the model server, when it reports usage. */
  promptTokens: number | null;
  completionTokens: number | null;
  ms: number;
};

export function formatMeasure(measure: PromptMeasure): string {
  const server = measure.promptTokens !== null ? ` (server: ${measure.promptTokens} in, ${measure.completionTokens ?? "?"} out)` : "";
  return (
    `[assistant] step ${measure.step}: ~${measure.totalTokens} tokens = system ${measure.systemTokens} + tools ${measure.toolsTokens} (${measure.toolCount})` +
    ` + history ${measure.historyTokens}${server}, skills [${measure.skills.join(", ")}], ${measure.ms} ms`
  );
}
