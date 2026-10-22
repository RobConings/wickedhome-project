import { z } from "zod";
import type { AssistantStreamEvent, AssistantToolStatus, ToolResult } from "@/features/assistant/types/assistant";
import type { ScreenRef } from "@/types/screen-context";
import { HttpError } from "@/api/lib/http";
import { prune } from "./compact";
import { invalidateAssistantContext } from "./context";
import { ModelError, type ChatMessage, type ChatModel, type ChatResult, type ToolCall } from "./llm-client";
import { invalidateEntityCache, resolveRefs } from "./resolve";
import { estimateJsonTokens, estimateMessageTokens, estimateTokens, PROMPT_BUDGET, type PromptMeasure } from "./tokens";
import {
  activityOf,
  allowsRemember,
  auditToolCall,
  canUseTool,
  confirmationOptionsOf,
  describeCall,
  needsConfirmation,
  previewCall,
  refusalOf,
  toOpenAiTools,
  type AssistantPreview,
  type AssistantToolContext,
  type RegisteredAssistantTool,
} from "./tools";

/**
 * The tool-call loop: ask the model, run the tools it calls (or pause for a confirmation), feed the results
 * back, and repeat until it answers in text or the step limit is reached. Pure apart from its dependencies,
 * so tests run it with a fake model and an in-memory store.
 *
 * Each step asks `plan(history)` which system prompt and tools to send (active skills, see routing.ts), so
 * a `skills_load` call in step 1 makes that skill's tools available in step 2 of the same turn.
 *
 * Several questions in one message: when the model answers in text but skipped a part (`followUp`, see
 * routing.ts `missedParts`), the loop asks it once more with a short note, within the step limit. Only the
 * final, combined answer is stored and shown: while a follow-up is still possible, the step's text is held
 * back instead of streamed, and a skipped answer is dropped (never stored, never sent to the browser). The
 * note itself goes to the model for the rest of this turn only.
 *
 * A model going in circles: the same tool with the same (normalised) arguments again in one turn is never run
 * twice; the model gets a short note to use the earlier result, that tool is no longer offered this turn, and
 * after `REPEATS_BEFORE_ANSWER` repeats, as on the last step, it must answer in text (tool_choice none plus a
 * note). A turn never ends without an answer: no text at all gives a short fallback answer (`FALLBACK_ANSWER`).
 */

/** One stored message, in the loop's shape (the service maps it to and from `AssistantMessage` rows). */
export type LoopMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  /** User messages: attached images as `data:` URLs (see `toChatMessages` for which reach the model). */
  images?: string[];
  /** User messages: the page it was asked from (screen context); its kind's skills count as asked for (routing.ts). */
  screen?: ScreenRef | null;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
  toolName?: string | null;
  /** The raw arguments the model sent (parsed JSON); validated again when a confirmation runs them. */
  toolArgs?: unknown;
  toolResult?: ToolResult | null;
  toolStatus?: AssistantToolStatus | null;
  toolSummary?: string | null;
};

export type NewLoopMessage = Omit<LoopMessage, "id">;

/** What one model call gets: the system prompt and the tools to offer. */
export type StepPlan = { systemPrompt: string; tools: RegisteredAssistantTool[]; skills?: string[] };

export type LoopDeps = {
  model: ChatModel;
  /** Every tool this person may use (already filtered by role): calls are looked up here. */
  tools: RegisteredAssistantTool[];
  ctx: AssistantToolContext;
  /** Used when there is no `plan`: the same prompt and all `tools` on every step. */
  systemPrompt: string;
  /** The prompt and tools per step (active skills). Default: `systemPrompt` and every tool. */
  plan?: (history: LoopMessage[]) => StepPlan | Promise<StepPlan>;
  /**
   * A short note added to the latest question (the clock time, the language to answer in), outside the cached
   * system prompt. A function gets the question's text (assistant-prompt `questionNoteFor`).
   */
  questionNote?: string | ((question: string) => string);
  /** Prompt size per model call (development logging, the eval harness). */
  onMeasure?: (measure: PromptMeasure) => void;
  /** Tool names the person ticked "don't ask again" for. */
  rememberedSkips: ReadonlySet<string>;
  save: (message: NewLoopMessage) => Promise<LoopMessage>;
  update: (id: string, patch: Partial<NewLoopMessage>) => Promise<void>;
  remember: (toolName: string) => Promise<void>;
  emit: (event: AssistantStreamEvent) => void;
  /** Model calls per turn (each may run tools). Default 8. */
  maxSteps?: number;
  /**
   * Parts of the question this turn skipped, as a note for the model (routing.ts `followUpFor`), or null.
   * Asked with `answer: null` before a step (could a follow-up still come?) and with the model's text answer
   * after it. At most one follow-up per turn.
   */
  followUp?: (history: LoopMessage[], answer: string | null) => string | null;
  /** For the server log when a turn fails (never the person's text or tool results). */
  log?: { conversationId?: string | null; model?: string | null };
};

export type LoopOutcome = "done" | "paused" | "error";

/** How many earlier messages are considered at most (the token budget usually trims sooner). */
export const HISTORY_LIMIT = 40;
/** Tool results of this turn are cut to this many characters before they go to the model. */
export const RESULT_LIMIT = 4000;
/** Results and long arguments of earlier turns are cut harder: the model already answered from them. */
export const OLD_RESULT_LIMIT = 600;
export const OLD_ARGUMENTS_LIMIT = 300;
export const DEFAULT_MAX_STEPS = 8;

export type ChatMessageOptions = {
  /** Added to the latest user message, e.g. "(now 14:05)". */
  questionNote?: string;
  /** Notes from the app to the model in the current turn, as user messages right after the message `afterId`. */
  notes?: { afterId: string; content: string }[];
  /** Estimated tokens for the messages after the system prompt; oldest turns are dropped to fit. */
  historyBudget?: number;
};

/** Long arguments of an earlier turn (geometry, lists) as a short valid JSON stand-in. */
function compactArguments(call: ToolCall): ToolCall {
  if (call.function.arguments.length <= OLD_ARGUMENTS_LIMIT) return call;
  return { ...call, function: { ...call.function, arguments: JSON.stringify({ _omitted: `${call.function.arguments.length} characters of arguments` }) } };
}

/** In place of the images of an earlier question: the model saw them then, a new image replaces them. */
export const earlierImagesNote = (count: number) => `(${count === 1 ? "an image was" : `${count} images were`} attached here; no longer shown)`;

/** Images stay with the conversation for this many questions (the one they came with included). */
export const IMAGE_TURNS = 3;

/**
 * A question as the model gets it. Images go along as content parts only for the latest question that has
 * them, and only while it is one of the last `IMAGE_TURNS` questions ("and now the first floor" still sees
 * the plan); others become a short note. A local vision model re-reads an image on every call, which made
 * long conversations with a plan time out.
 */
function userMessage(message: LoopMessage, text: string, withImages: boolean): ChatMessage {
  const images = message.images ?? [];
  if (!images.length) return { role: "user", content: text };
  if (!withImages) return { role: "user", content: `${text}\n\n${earlierImagesNote(images.length)}`.trim() };
  return { role: "user", content: [...(text ? [{ type: "text" as const, text }] : []), ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))] };
}

/**
 * The conversation as the model sees it: the system prompt, then the latest messages (never a pending
 * call). Earlier turns are compacted (results and long arguments cut); whole turns are dropped, oldest
 * first, until the history fits its token budget. The current turn is always kept.
 */
export function toChatMessages(systemPrompt: string, history: LoopMessage[], options: ChatMessageOptions = {}): ChatMessage[] {
  let recent = history.slice(-HISTORY_LIMIT);
  // Start at a user message, so no tool answer is left without the call it answers.
  const firstUser = recent.findIndex((message) => message.role === "user");
  recent = firstUser >= 0 ? recent.slice(firstUser) : [];
  const lastUser = recent.findLastIndex((message) => message.role === "user");
  const userIndexes = recent.flatMap((message, index) => (message.role === "user" ? [index] : []));
  const imageWindowStart = userIndexes[Math.max(0, userIndexes.length - IMAGE_TURNS)] ?? 0;
  const latestWithImages = recent.findLastIndex((message) => message.role === "user" && Boolean(message.images?.length));
  const lastWithImages = latestWithImages >= imageWindowStart ? latestWithImages : -1;

  // Turns: each starts at a user message.
  const turns: ChatMessage[][] = [];
  recent.forEach((message, index) => {
    const current = index >= lastUser;
    if (message.role === "user") {
      const content = index === lastUser && options.questionNote ? `${message.content}\n\n${options.questionNote}` : message.content;
      turns.push([userMessage(message, content, index === lastWithImages)]);
      return;
    }
    const turn = turns[turns.length - 1];
    if (!turn) return;
    if (message.role === "assistant") {
      const calls = message.toolCalls?.length ? (current ? message.toolCalls : message.toolCalls.map(compactArguments)) : null;
      turn.push({ role: "assistant", content: message.content || null, ...(calls && { tool_calls: calls }) });
    } else if (message.toolCallId) {
      turn.push({ role: "tool", tool_call_id: message.toolCallId, content: resultForModel(message.toolResult ?? null, current ? RESULT_LIMIT : OLD_RESULT_LIMIT) });
    }
    if (current) for (const note of options.notes ?? []) if (note.afterId === message.id) turn.push({ role: "user", content: note.content });
  });

  if (options.historyBudget !== undefined) {
    const size = (turn: ChatMessage[]) => turn.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
    let total = turns.reduce((sum, turn) => sum + size(turn), 0);
    while (turns.length > 1 && total > options.historyBudget) total -= size(turns.shift() ?? []);
  }
  return [{ role: "system", content: systemPrompt }, ...turns.flat()];
}

/** A tool result as compact text for the model (nulls dropped), cut to `limit` characters. */
export function resultForModel(result: ToolResult | null, limit = RESULT_LIMIT): string {
  const text = JSON.stringify(prune(result ?? { ok: false, error: "No result" }));
  return text.length > limit ? `${text.slice(0, limit)}… (cut off)` : text;
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return `Invalid arguments: ${issuesOf(error)}`;
  if (error instanceof HttpError) {
    const fields = error.fields ? ` (${Object.entries(error.fields).map(([key, messages]) => `${key}: ${messages.join(", ")}`).join("; ")})` : "";
    return `${error.message}${fields}`;
  }
  console.error("Assistant tool failed", error);
  return "The action failed because of an error in the app";
}

/** Validation issues as one line for the model, so it can correct its arguments. */
function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((issue) => `${issue.path.map(String).join(".") || "arguments"}: ${issue.message}`).join("; ");
}

/**
 * Validates the raw arguments and resolves the names in them (`entityRef`): what `describe`, `preview` and
 * `run` receive. A problem comes back as a message for the model ("Which person: …?").
 */
export async function prepareInput(tool: RegisteredAssistantTool, ctx: AssistantToolContext, rawArgs: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  // The person's role first, for the tool and for these arguments (a child may use stock up, not set a count):
  // a refused call never reaches a confirmation card, a name lookup or `run`, in the chat and over MCP alike.
  if (!canUseTool(tool, ctx.user.role)) return { ok: false, error: NOT_ALLOWED };
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: `Invalid arguments: ${issuesOf(parsed.error)}` };
  const refused = refusalOf(tool, ctx, parsed.data);
  if (refused) return { ok: false, error: refused };
  return resolveRefs(ctx, parsed.data);
}

export const NOT_ALLOWED = "This person is not allowed to do this";

/** Runs a validated tool. Never throws: failures become `{ ok: false, error }`. */
export async function runTool(tool: RegisteredAssistantTool, ctx: AssistantToolContext, rawArgs: unknown): Promise<ToolResult> {
  const input = await prepareInput(tool, ctx, rawArgs);
  if (!input.ok) return input;
  try {
    const data = await tool.run(ctx, input.data);
    if (tool.permission !== "read") {
      // Names and the snapshot may have changed: look them up fresh next time.
      invalidateEntityCache(ctx.householdId);
      invalidateAssistantContext(ctx.householdId);
    }
    // The one place every assistant and MCP write passes: record it in the household audit log.
    await auditToolCall(tool, ctx, input.data);
    return { ok: true, data: data ?? null };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function parseArguments(raw: string): { ok: true; value: unknown } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

const statusOf = (result: ToolResult): AssistantToolStatus => (result.ok ? "done" : "failed");

/** Handles one tool call of the model: run it, or store it as pending and ask for a confirmation. */
/** JSON with sorted keys, so two calls with the same arguments in another order compare equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The messages of the current turn (after the latest question). */
const currentTurn = (history: LoopMessage[]) => history.slice(history.findLastIndex((message) => message.role === "user") + 1);

/** Whether this turn already made exactly this call (a local model sometimes repeats a call over and over). */
function calledBefore(history: LoopMessage[], toolName: string, args: unknown): boolean {
  const key = stableJson(args);
  return currentTurn(history).some((message) => message.role === "tool" && message.toolName === toolName && stableJson(message.toolArgs ?? {}) === key);
}

export const REPEATED_CALL_ERROR = "You already called this with the same arguments; use the earlier result and answer now (or explain what's missing).";
/** The note for a step that must answer in text: the last step, or after the model repeated itself. */
export const ANSWER_NOW_NOTE = "Answer the person now in plain text with what you have; don't call any tool. If something could not be done or found, say so and why.";
/** The note after an answer that only announced an action ("Ik ga nu de keuken tekenen.") without doing it. */
export const ACT_NOW_NOTE =
  "You said you would do something but called no tool, so nothing happened. Do it now with the right tool call. If you can't (something is missing or unclear), say what in one sentence.";

/**
 * Whether an answer only announces what the model is about to do ("Ik ga nu … tekenen", "I'll now …") and
 * doesn't ask the person anything: then the loop asks it once to actually do it (a text answer ends the turn).
 */
export function announcesAction(text: string): boolean {
  const last = text.trim().split(/\n\s*\n/).at(-1) ?? "";
  if (!last || /\?\s*\**\s*$/.test(last)) return false;
  return /\b(ik ga (nu |het |de |dit |hem |ze |even |direct |meteen )*\w+|ik begin (nu |direct |meteen )?(met|aan)|ik (teken|maak|pas|verplaats|voeg|zet|verwijder) (nu|direct|meteen)|laat me (nu )?(even )?\w+|i('ll| will) (now |go ahead and |start )?\w+|i'm going to|let me (now )?\w+|i'm (now )?(going|starting) to)\b/i.test(last);
}

/** Repeated calls in one turn after which the model must answer (no more tool calls). */
export const REPEATS_BEFORE_ANSWER = 2;
/** What the person sees when the model gives no answer at all, even when asked to answer without tools. */
export const FALLBACK_ANSWER = {
  nl: "Ik kon dit niet afronden. Probeer het anders te vragen of geef wat meer details.",
  en: "I couldn't finish this. Try asking it differently or give a few more details.",
} as const;

/** The tools the model called again with the same arguments in this turn (never run twice). */
function repeatedThisTurn(history: LoopMessage[]): string[] {
  return currentTurn(history).flatMap((message) => (message.role === "tool" && message.toolResult?.ok === false && message.toolResult.error === REPEATED_CALL_ERROR ? [message.toolName ?? ""] : []));
}

async function handleCall(call: ToolCall, deps: LoopDeps, step: number, history: LoopMessage[]): Promise<LoopMessage> {
  const tool = deps.tools.find((candidate) => candidate.wireName === call.function.name);
  const base = { role: "tool" as const, content: "", toolCallId: call.id, toolName: tool?.name ?? call.function.name };
  const failWith = async (error: string, toolArgs?: unknown) => {
    const saved = await deps.save({ ...base, toolArgs, toolResult: { ok: false, error }, toolStatus: "failed", toolSummary: null });
    deps.emit({ type: "tool", messageId: saved.id, toolCallId: call.id, name: base.toolName, status: "failed", label: tool ? activityOf(tool, deps.ctx.locale) : base.toolName });
    return saved;
  };
  if (!tool) return failWith(`Unknown tool "${call.function.name}". Use skills_load to get the tools of an area.`);

  const args = parseArguments(call.function.arguments);
  if (!args.ok) {
    // The model gets the error and usually corrects itself; the line tells how often a model does this.
    console.warn("[assistant] invalid tool call", { conversationId: deps.log?.conversationId ?? null, step, model: deps.log?.model ?? null, tool: tool.name, error: "arguments were not valid JSON" });
    return failWith("The arguments were not valid JSON");
  }

  if (calledBefore(history, tool.name, args.value)) {
    // Not run (nor asked) again, and no chip: the model gets a nudge to answer instead.
    return deps.save({ ...base, toolArgs: args.value, toolResult: { ok: false, error: REPEATED_CALL_ERROR }, toolStatus: "failed", toolSummary: null });
  }

  const label = activityOf(tool, deps.ctx.locale);
  if (needsConfirmation(tool, deps.rememberedSkips.has(tool.name))) {
    // Resolve names before asking, so the card says "Clara", and an unknown name never reaches the person.
    const input = await prepareInput(tool, deps.ctx, args.value);
    if (!input.ok) return failWith(input.error, args.value);
    let summary: string;
    let preview: AssistantPreview | null;
    try {
      [summary, preview] = await Promise.all([describeCall(tool, deps.ctx, input.data), previewCall(tool, deps.ctx, input.data)]);
    } catch (error) {
      // The preview found the change impossible: tell the model, don't ask the person.
      return failWith(errorMessage(error), args.value);
    }
    const saved = await deps.save({ ...base, toolArgs: args.value, toolResult: null, toolStatus: "pending", toolSummary: summary });
    deps.emit(confirmEvent(saved, tool, preview, deps.ctx.locale));
    return saved;
  }

  deps.emit({ type: "tool", messageId: null, toolCallId: call.id, name: tool.name, status: "running", label });
  const result = await runTool(tool, deps.ctx, args.value);
  const saved = await deps.save({ ...base, toolArgs: args.value, toolResult: result, toolStatus: statusOf(result), toolSummary: label });
  deps.emit({ type: "tool", messageId: saved.id, toolCallId: call.id, name: tool.name, status: statusOf(result), label });
  return saved;
}

function confirmEvent(message: LoopMessage, tool: RegisteredAssistantTool, preview: AssistantPreview | null, locale: AssistantToolContext["locale"]): AssistantStreamEvent {
  return {
    type: "confirm",
    messageId: message.id,
    toolCallId: message.toolCallId ?? "",
    name: tool.name,
    summary: message.toolSummary ?? activityOf(tool, "en"),
    permission: tool.permission,
    allowRemember: allowsRemember(tool),
    preview,
    options: confirmationOptionsOf(tool, locale),
  };
}

/** The preview of a stored pending call (recomputed from its arguments, e.g. after a reload). */
export async function previewOfPending(message: LoopMessage, tool: RegisteredAssistantTool, ctx: AssistantToolContext): Promise<AssistantPreview | null> {
  if (!tool.preview) return null;
  const input = await prepareInput(tool, ctx, message.toolArgs);
  return input.ok ? previewCall(tool, ctx, input.data).catch(() => null) : null;
}

/** Asks the model once; falls back to a chat without tools when the model has no tool support. */
type AskOptions = {
  /** `"none"`: the model must answer in text (the tools are still sent, with tool_choice none). */
  toolChoice: "auto" | "none";
  /** Tools not offered this step (the model already repeated a call of them). */
  withhold?: ReadonlySet<string>;
  /** Let the model reason this time (llm-client `reasoning`). */
  reasoning?: boolean;
  notes: { afterId: string; content: string }[];
  /** Collect the text instead of streaming it (a follow-up may still replace this answer). */
  holdText?: string[];
};

async function ask(step: number, history: LoopMessage[], deps: LoopDeps, { toolChoice, withhold, reasoning, notes, holdText }: AskOptions): Promise<ChatResult> {
  const plan = deps.plan ? await deps.plan(history) : { systemPrompt: deps.systemPrompt, tools: deps.tools };
  const question = history.findLast((message) => message.role === "user")?.content ?? "";
  const questionNote = typeof deps.questionNote === "function" ? deps.questionNote(question) : deps.questionNote;
  const messages = toChatMessages(plan.systemPrompt, history, { questionNote, historyBudget: PROMPT_BUDGET.history, notes });
  const offered = withhold?.size ? plan.tools.filter((tool) => !withhold.has(tool.name)) : plan.tools;
  const tools = offered.length ? toOpenAiTools(offered) : undefined;
  const choice = tools && toolChoice === "none" ? { toolChoice } : {};
  const onText = (text: string) => (holdText ? holdText.push(text) : deps.emit({ type: "text", text }));
  const started = Date.now();
  const measure = (result: ChatResult | null) => {
    if (!deps.onMeasure) return;
    const systemTokens = estimateTokens(plan.systemPrompt);
    const toolsTokens = tools ? estimateJsonTokens(tools) : 0;
    const historyTokens = messages.slice(1).reduce((sum, message) => sum + estimateMessageTokens(message), 0);
    deps.onMeasure({
      step,
      systemTokens,
      toolsTokens,
      historyTokens,
      totalTokens: systemTokens + toolsTokens + historyTokens,
      toolCount: tools?.length ?? 0,
      skills: plan.skills ?? [],
      promptTokens: result?.usage?.promptTokens ?? null,
      completionTokens: result?.usage?.completionTokens ?? null,
      ms: Date.now() - started,
    });
  };
  try {
    const result = await deps.model({ messages, tools, signal: deps.ctx.signal, onText, ...choice, ...(reasoning && { reasoning }) });
    measure(result);
    return result;
  } catch (error) {
    if (error instanceof ModelError && error.code === "no_tools" && tools) {
      deps.emit({ type: "notice", code: "no_tools" });
      const result = await deps.model({ messages, signal: deps.ctx.signal, onText, ...(reasoning && { reasoning }) });
      measure(result);
      return result;
    }
    throw error;
  }
}

/**
 * Runs the model until it answers in text (`done`), a tool waits for a confirmation (`paused`), or the model
 * fails (`error`, emitted). `history` holds every stored message, the new question included; it is extended
 * in place with what this turn stores.
 */
export async function runAssistantLoop(history: LoopMessage[], deps: LoopDeps): Promise<LoopOutcome> {
  const maxSteps = deps.maxSteps ?? DEFAULT_MAX_STEPS;
  const notes: { afterId: string; content: string }[] = [];
  // Thinking is off for speed; a fast answer that goes wrong (empty, or the same call again) gets the
  // model's reasoning for the rest of the turn, and an empty answer is asked once more.
  let reasoning = false;
  let retriedEmpty = false;
  let warnedMaxSteps = false;
  let nudgedToAct = false;
  let step = 0;
  try {
    for (; step <= maxSteps; step += 1) {
      const lastStep = step === maxSteps;
      if (lastStep && !warnedMaxSteps) {
        warnedMaxSteps = true;
        deps.emit({ type: "notice", code: "max_steps" });
      }
      // A model going in circles: a tool it repeated a call of is no longer offered this turn, and after a few
      // repeats (or on the last step) it must answer with what it has (tool_choice none and a short note).
      const repeated = repeatedThisTurn(history);
      const mustAnswer = lastStep || repeated.length >= REPEATS_BEFORE_ANSWER;
      const last = history[history.length - 1];
      const stepNotes = mustAnswer && last ? [...notes, { afterId: last.id, content: ANSWER_NOW_NOTE }] : notes;
      // A follow-up needs room for a tool step and an answer; until it is ruled out, the text is held back.
      const mayFollowUp = Boolean(deps.followUp) && !mustAnswer && !notes.length && step + 2 <= maxSteps && deps.followUp?.(history, null) !== null;
      const held: string[] | undefined = mayFollowUp ? [] : undefined;
      const answer = await ask(step + 1, history, deps, { toolChoice: mustAnswer ? "none" : "auto", withhold: new Set(repeated), reasoning, notes: stepNotes, holdText: held });
      const toolCalls = mustAnswer ? [] : answer.toolCalls;
      if (!toolCalls.length && !answer.content.trim() && !retriedEmpty) {
        // Nothing usable (no text, or only tool-call markup, which is filtered): once more, with reasoning,
        // the same step again when it was the last one.
        retriedEmpty = true;
        reasoning = true;
        if (lastStep) step -= 1;
        continue;
      }
      if (!toolCalls.length && mayFollowUp && last) {
        const note = deps.followUp?.(history, answer.content) ?? null;
        if (note) {
          // The answer skipped a part: drop it (not stored, not shown) and ask once more.
          notes.push({ afterId: last.id, content: note });
          continue;
        }
      }
      if (!toolCalls.length && !answer.content.trim()) return await fallbackAnswer(history, deps, step + 1);
      if (held?.length) deps.emit({ type: "text", text: held.join("") });
      const saved = await deps.save({ role: "assistant", content: answer.content, toolCalls: toolCalls.length ? toolCalls : null });
      history.push(saved);
      deps.emit({ type: "message", messageId: saved.id, role: "assistant" });
      if (!toolCalls.length) {
        // "Ik ga nu de zithoek tekenen." and nothing else: the answer stays, and the model gets one nudge to act.
        if (!nudgedToAct && !mustAnswer && step + 1 < maxSteps && announcesAction(answer.content)) {
          nudgedToAct = true;
          notes.push({ afterId: saved.id, content: ACT_NOW_NOTE });
          continue;
        }
        return "done";
      }

      // Several calls in one answer run in the order the model sent them; reads run at once, a write that
      // needs a confirmation is stored as pending (its card shown) and the turn pauses after the last call.
      let paused = false;
      for (const call of toolCalls) {
        const message = await handleCall(call, deps, step + 1, history);
        history.push(message);
        if (message.toolStatus === "pending") paused = true;
        if (message.toolResult && !message.toolResult.ok && message.toolResult.error === REPEATED_CALL_ERROR) reasoning = true;
      }
      if (paused) return "paused";
      if (deps.ctx.signal.aborted) throw new ModelError("aborted", "Stopped");
    }
    return await fallbackAnswer(history, deps, step);
  } catch (error) {
    const code = error instanceof ModelError ? error.code : "internal";
    const message = error instanceof Error ? error.message : "Something went wrong";
    if (!(error instanceof ModelError)) console.error("Assistant loop failed", error);
    // One line per failed turn, so "no answer" can be traced; never the question or tool results.
    console.warn("[assistant] turn failed", { conversationId: deps.log?.conversationId ?? null, step: step + 1, model: deps.log?.model ?? null, error: `${code}: ${message.slice(0, 200)}` });
    deps.emit({ type: "error", code, message });
    // Stored too (not for Stop): coming back later, the conversation says why there was no answer.
    if (code !== "aborted") await saveFailureNote(history, deps, code);
    return "error";
  }
}

/** What a failed turn leaves in the conversation, per kind of failure. */
export const FAILURE_NOTE = {
  timeout: {
    nl: "Het model antwoordde niet op tijd. Vraag het opnieuw; helpt dat niet, begin dan een nieuw gesprek (lange gesprekken met afbeeldingen zijn traag).",
    en: "The model didn't answer in time. Ask again; if that doesn't help, start a new conversation (long conversations with images are slow).",
  },
  other: {
    nl: "Er ging iets mis met het model, dus ik kon niet antwoorden. Vraag het opnieuw.",
    en: "Something went wrong with the model, so I couldn't answer. Ask again.",
  },
} as const;

async function saveFailureNote(history: LoopMessage[], deps: LoopDeps, code: string) {
  try {
    const kind = code === "timeout" ? FAILURE_NOTE.timeout : FAILURE_NOTE.other;
    const saved = await deps.save({ role: "assistant", content: kind[deps.ctx.locale] ?? kind.en, toolCalls: null });
    history.push(saved);
  } catch {
    // The live error event already told the person; a store that fails here changes nothing.
  }
}

/**
 * The model gave no text at all, even when told to answer without tools: a short answer in the person's
 * language instead of silence, stored like any answer, and one server log line (never the question).
 */
async function fallbackAnswer(history: LoopMessage[], deps: LoopDeps, step: number): Promise<LoopOutcome> {
  console.warn("[assistant] fallback answer", { conversationId: deps.log?.conversationId ?? null, step, model: deps.log?.model ?? null, error: "empty_answer: the model gave no text" });
  const content = FALLBACK_ANSWER[deps.ctx.locale] ?? FALLBACK_ANSWER.en;
  deps.emit({ type: "text", text: content });
  const saved = await deps.save({ role: "assistant", content, toolCalls: null });
  history.push(saved);
  deps.emit({ type: "message", messageId: saved.id, role: "assistant" });
  return "done";
}

export type ConfirmationDecision = {
  decision: "confirm" | "cancel";
  remember?: boolean;
  /** Arguments the person changed on the card (only the tool's `confirmation.editable` ones). */
  edits?: Record<string, unknown>;
  /** The button the person picked (one of the tool's `confirmation.choices`), written into its field. */
  choice?: string;
};

/** Thrown when the message isn't a pending confirmation of this conversation (already handled, unknown). */
export class NotPendingError extends Error {}

/** Edits or a choice the tool doesn't allow, or amended arguments that are invalid: nothing ran. */
export class InvalidConfirmationError extends Error {}

/**
 * The arguments a confirmation runs with: the stored ones, amended by the person's edits and choice. Only the
 * tool's editable fields and choice values are accepted; the result is validated again by the tool's schema
 * (names resolved) and previewed again (a preview may still refuse). Throws `InvalidConfirmationError`.
 * Without edits or a choice: the stored arguments, untouched.
 */
export async function amendedArguments(
  tool: RegisteredAssistantTool,
  ctx: AssistantToolContext,
  storedArgs: unknown,
  { edits, choice }: Pick<ConfirmationDecision, "edits" | "choice">,
): Promise<{ args: unknown; changed: string[] }> {
  const editKeys = Object.keys(edits ?? {});
  if (!editKeys.length && choice === undefined) return { args: storedArgs, changed: [] };
  const options = tool.confirmation;
  const allowed = new Set(options?.editable ?? []);
  const refused = editKeys.filter((key) => !allowed.has(key));
  if (refused.length) throw new InvalidConfirmationError(`These can't be changed on the card: ${refused.join(", ")}`);
  const args: Record<string, unknown> = { ...((storedArgs && typeof storedArgs === "object" ? storedArgs : {}) as Record<string, unknown>) };
  const changed: string[] = [];
  for (const key of editKeys) {
    const value = (edits as Record<string, unknown>)[key];
    if (JSON.stringify(args[key]) !== JSON.stringify(value)) changed.push(key);
    args[key] = value;
  }
  if (choice !== undefined) {
    if (!options?.choices?.options.some((option) => option.value === choice)) throw new InvalidConfirmationError(`Not a choice of this action: ${choice}`);
    args[options.choices.field] = choice;
  }
  const input = await prepareInput(tool, ctx, args);
  if (!input.ok) throw new InvalidConfirmationError(input.error);
  try {
    await previewCall(tool, ctx, input.data);
  } catch (error) {
    throw new InvalidConfirmationError(errorMessage(error));
  }
  return { args, changed };
}

/** Shows the confirmation card of the next pending call of this turn (a tool that vanished is failed). */
async function nextPending(history: LoopMessage[], deps: LoopDeps): Promise<LoopOutcome | null> {
  for (;;) {
    const next = history.find((candidate) => candidate.role === "tool" && candidate.toolStatus === "pending");
    if (!next) return null;
    const tool = deps.tools.find((candidate) => candidate.name === next.toolName);
    if (tool) {
      deps.emit(confirmEvent(next, tool, await previewOfPending(next, tool, deps.ctx), deps.ctx.locale));
      return "paused";
    }
    // The tool is gone (role changed, feature removed): answer the call so the conversation stays valid.
    const gone: ToolResult = { ok: false, error: "This tool is no longer available" };
    await deps.update(next.id, { toolResult: gone, toolStatus: "failed" });
    Object.assign(next, { toolResult: gone, toolStatus: "failed" });
  }
}

/**
 * The person confirmed or cancelled a pending tool call. Runs (or cancels) it, then shows the next pending
 * confirmation of the same turn, or continues the loop once none is left.
 */
export async function resolveConfirmation(
  history: LoopMessage[],
  messageId: string,
  { decision, remember = false, edits, choice }: ConfirmationDecision,
  deps: LoopDeps,
): Promise<LoopOutcome> {
  const message = history.find((candidate) => candidate.id === messageId);
  if (!message || message.role !== "tool" || message.toolStatus !== "pending") throw new NotPendingError();
  const tool = deps.tools.find((candidate) => candidate.name === message.toolName);

  let result: ToolResult;
  let status: AssistantToolStatus;
  if (decision === "cancel") {
    result = { ok: false, error: "The person cancelled this action. Nothing was changed." };
    status = "cancelled";
  } else if (!tool) {
    result = { ok: false, error: NOT_ALLOWED };
    status = "failed";
  } else {
    // Edits and the choice are checked before anything happens; invalid ones throw and the card stays.
    const { args, changed } = await amendedArguments(tool, deps.ctx, message.toolArgs, { edits, choice });
    if (args !== message.toolArgs) {
      // What runs (and is audited) is what the person confirmed: store it, with its new summary.
      const input = await prepareInput(tool, deps.ctx, args);
      const summary = input.ok ? await describeCall(tool, deps.ctx, input.data) : (message.toolSummary ?? null);
      await deps.update(messageId, { toolArgs: args, toolSummary: summary });
      Object.assign(message, { toolArgs: args, toolSummary: summary });
    }
    if (remember && allowsRemember(tool)) await deps.remember(tool.name);
    deps.emit({ type: "tool", messageId, toolCallId: message.toolCallId ?? "", name: tool.name, status: "running", label: activityOf(tool, deps.ctx.locale) });
    result = await runTool(tool, deps.ctx, args);
    // The model wrote other arguments than what ran: tell it what the person changed.
    if (result.ok && changed.length) result = { ok: true, data: { result: result.data, changedByPerson: changed } };
    status = statusOf(result);
  }
  const label = tool ? activityOf(tool, deps.ctx.locale) : (message.toolName ?? "");
  await deps.update(messageId, { toolResult: result, toolStatus: status });
  Object.assign(message, { toolResult: result, toolStatus: status });
  deps.emit({ type: "tool", messageId, toolCallId: message.toolCallId ?? "", name: message.toolName ?? "", status, label });

  return (await nextPending(history, deps)) ?? runAssistantLoop(history, deps);
}

/** Pending calls the person never answered (they asked something else): answered as not confirmed. */
export async function cancelPending(history: LoopMessage[], deps: Pick<LoopDeps, "update">): Promise<number> {
  const pending = history.filter((message) => message.role === "tool" && message.toolStatus === "pending");
  for (const message of pending) {
    const result: ToolResult = { ok: false, error: "Not confirmed: the person asked something else instead. Nothing was changed." };
    await deps.update(message.id, { toolResult: result, toolStatus: "cancelled" });
    Object.assign(message, { toolResult: result, toolStatus: "cancelled" });
  }
  return pending.length;
}
