import { createHash, randomBytes } from "node:crypto";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import {
  ASSISTANT_IMAGE_MAX_BYTES,
  titleFromQuestion,
  type AssistantAccessToken,
  type AssistantImageType,
  type AssistantConfirmationInput,
  type AssistantConversationDetail,
  type AssistantConversationSummary,
  type AssistantMessage,
  type AssistantMessageInput,
  type AssistantPreviewPayload,
  type AssistantSkillInfo,
  type AssistantStatus,
  type AssistantStreamEvent,
  type AssistantTokenInput,
  type AssistantToolStatus,
  type CreatedAssistantToken,
  type ToolResult,
} from "@/features/assistant/types/assistant";
import type { Locale } from "@/types/common";
import {
  db,
  type AssistantMessage as MessageRow,
  type AssistantToolStatus as ToolStatusRow,
  type Prisma,
} from "@/api/lib/db";
import { badRequest, conflict, notFound } from "@/api/lib/http";
import { readAssistantSettings, type AssistantSettings } from "./assistant-config";
import {
  InvalidConfirmationError,
  NotPendingError,
  amendedArguments,
  cancelPending,
  previewOfPending,
  resolveConfirmation,
  runAssistantLoop,
  type LoopDeps,
  type LoopMessage,
  type NewLoopMessage,
} from "./assistant-loop";
import { buildSystemPrompt, questionNoteFor } from "./assistant-prompt";
import { householdSnapshot } from "./context";
import "./core-tools";
import { createOpenAiChatModel, probeModel, type ChatModel, type ModelProbe, type ToolCall } from "./llm-client";
import { queuedModel, setModelConcurrency } from "./model-queue";
import { entityMentionMatcher } from "./resolve";
import { followUpFor, planTurn } from "./routing";
import { readStoredScreen, resolveScreen, storedScreen, withScreenNote, type ResolvedScreen } from "./screen-context";
import { skillsForRole, type RegisteredAssistantSkill } from "./skills";
import { formatMeasure, type PromptMeasure } from "./tokens";
import { activityOf, allowsRemember, confirmationOptionsOf, getAssistantTool, toolsFor, type AssistantToolContext, type RegisteredAssistantTool } from "./tools";

// ── Mapping ───────────────────────────────────────────────────────────────────────────────────────────

const toStatus = (row: ToolStatusRow | null): AssistantToolStatus | null => (row ? (row.toLowerCase() as AssistantToolStatus) : null);
const fromStatus = (status: AssistantToolStatus): ToolStatusRow => status.toUpperCase() as ToolStatusRow;
const toRole = (row: MessageRow["role"]) => row.toLowerCase() as LoopMessage["role"];

function toLoopMessage(row: MessageRow): LoopMessage {
  return {
    id: row.id,
    role: toRole(row.role),
    content: row.content,
    toolCalls: (row.toolCalls as ToolCall[] | null) ?? null,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    toolArgs: row.toolArgs ?? undefined,
    toolResult: (row.toolResult as ToolResult | null) ?? null,
    toolStatus: toStatus(row.toolStatus),
    toolSummary: row.toolSummary,
    ...(row.role === "USER" && { screen: readStoredScreen(row.screen) }),
  };
}

function toMessage(row: MessageRow & { images?: { id: string }[] }, locale: Locale, preview: AssistantPreviewPayload | null = null): AssistantMessage {
  const tool = row.toolName ? getAssistantTool(row.toolName) : undefined;
  const result = row.toolResult as ToolResult | null;
  const screen = row.role === "USER" ? readStoredScreen(row.screen) : null;
  return {
    id: row.id,
    role: toRole(row.role),
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    ...(row.images?.length && { images: row.images.map((image) => image.id) }),
    ...(screen && { screen }),
    tool:
      row.role === "TOOL"
        ? {
            name: row.toolName ?? "",
            status: toStatus(row.toolStatus) ?? "failed",
            summary: row.toolStatus === "PENDING" ? row.toolSummary : tool ? activityOf(tool, locale) : row.toolSummary,
            permission: tool?.permission ?? null,
            allowRemember: tool ? allowsRemember(tool) : false,
            error: result && !result.ok ? result.error : null,
            ...(preview && { preview }),
            ...(row.toolStatus === "PENDING" && tool && confirmationOptionsOf(tool, locale) && { options: confirmationOptionsOf(tool, locale) }),
          }
        : null,
  };
}

const toSummary = (row: { id: string; title: string | null; lastMessageAt: Date; createdAt: Date }): AssistantConversationSummary => ({
  id: row.id,
  title: row.title,
  lastMessageAt: row.lastMessageAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

const json = (value: unknown) => (value === undefined || value === null ? undefined : (value as Prisma.InputJsonValue));

// ── Conversations ─────────────────────────────────────────────────────────────────────────────────────

const LIST_LIMIT = 100;

export async function listConversations(user: SessionUser): Promise<AssistantConversationSummary[]> {
  const rows = await db.assistantConversation.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(toSummary);
}

async function findOwnConversation(user: SessionUser, id: string) {
  const row = await db.assistantConversation.findFirst({ where: { id, userId: user.id } });
  if (!row) throw notFound("Conversation not found");
  return row;
}

/** `hidden`: messages of an answer still being written, left out because the chat replays them from the run. */
export async function getConversation(user: SessionUser, id: string, hidden?: ReadonlySet<string>): Promise<AssistantConversationDetail> {
  const row = await findOwnConversation(user, id);
  const messages = await db.assistantMessage.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { images: { select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  const ctx = toolContext(user, new AbortController().signal);
  const visible = messages.filter((message) => (message.role !== "ASSISTANT" || message.content.trim()) && !hidden?.has(message.id));
  return {
    ...toSummary(row),
    // Assistant messages with only tool calls have no text to show; their tools have their own messages.
    messages: await Promise.all(
      visible.map(async (message) => {
        // A pending confirmation shows its preview again after a reload (recomputed, nothing stored).
        const tool = message.toolStatus === "PENDING" && message.toolName ? getAssistantTool(message.toolName) : undefined;
        const preview = tool?.preview ? await previewOfPending(toLoopMessage(message), tool, ctx) : null;
        return toMessage(message, user.locale, preview);
      }),
    ),
  };
}

export async function renameConversation(user: SessionUser, id: string, title: string): Promise<AssistantConversationSummary> {
  await findOwnConversation(user, id);
  return toSummary(await db.assistantConversation.update({ where: { id }, data: { title } }));
}

export async function deleteConversation(user: SessionUser, id: string): Promise<void> {
  await findOwnConversation(user, id);
  await db.assistantConversation.delete({ where: { id } });
}

/** Retention: conversations without activity for `days` are deleted with their messages. */
export async function deleteOldConversations(days: number, now = new Date()): Promise<number> {
  const { count } = await db.assistantConversation.deleteMany({ where: { lastMessageAt: { lt: new Date(now.getTime() - days * 86_400_000) } } });
  return count;
}

// ── Chat ──────────────────────────────────────────────────────────────────────────────────────────────

export type ChatOptions = {
  emit: (event: AssistantStreamEvent) => void;
  signal: AbortSignal;
  /** Tests pass a fake model and settings. */
  model?: ChatModel;
  settings?: AssistantSettings;
  /** Prompt sizes per model call (the eval harness); default: logged in development. */
  onMeasure?: (measure: PromptMeasure) => void;
  /** Each message as it is stored (assistant-runs: hidden from the detail while the answer runs). */
  onSaved?: (id: string) => void;
};

/** Thrown when the assistant can't run: not configured. The route answers 409 before streaming. */
export class AssistantNotConfiguredError extends Error {}

function modelFor(options: ChatOptions): ChatModel {
  if (options.model) return options.model;
  const settings = options.settings ?? readAssistantSettings();
  if (settings.problem) throw new AssistantNotConfiguredError(settings.problem);
  setModelConcurrency(settings.parallel ?? 1);
  // One call at a time at the model server, chats first; the person sees "waiting…" / "restarting…".
  return queuedModel(createOpenAiChatModel(settings), { priority: "chat", onStatus: (code) => options.emit({ type: "status", code }) });
}

async function loadHistory(conversationId: string): Promise<LoopMessage[]> {
  const rows = await db.assistantMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { images: { select: { mimeType: true, data: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  return rows.map((row) => ({ ...toLoopMessage(row), ...(row.images.length && { images: row.images.map(toDataUrl) }) }));
}

const toolContext = (user: SessionUser, signal: AbortSignal, screen: ResolvedScreen | null = null): AssistantToolContext => ({
  user,
  householdId: user.householdId,
  locale: user.locale,
  signal,
  channel: "chat",
  // Tools see only the reference, and only for a screen that was found for this household.
  ...(screen && { screen: { kind: screen.kind, ...(screen.id && { id: screen.id }) } }),
});

/** The skills a person has that come with tools of their own (the prompt's index of areas). */
export function skillIndexFor(permitted: RegisteredAssistantTool[], role: SessionUser["role"]): RegisteredAssistantSkill[] {
  const withTools = new Set(permitted.filter((tool) => !tool.core).map((tool) => tool.skill));
  return skillsForRole(role).filter((skill) => withTools.has(skill.id));
}

/** Prompt sizes per model call in the server log, during development (docs: ai/README.md). */
const logMeasure = (measure: PromptMeasure) => {
  if (process.env.NODE_ENV !== "production" || process.env.ASSISTANT_LOG_TOKENS === "1") console.log(formatMeasure(measure));
};

export type PlanOptions = { settings?: Pick<AssistantSettings, "thinking" | "model"> };

/**
 * `/no_think` in the system prompt is Qwen 3's switch; other models (Gemma…) would only read it as text.
 * Reasoning is switched off for every model in the request itself (llm-client `reasoning_effort`).
 */
export const usesNoThinkTag = (model: string | null | undefined) => /qwen/i.test(model ?? "");

/** The loop's `plan` for a person: active skills → system prompt + tools, per step. */
export async function planFor(user: SessionUser, ctx: AssistantToolContext, permitted: RegisteredAssistantTool[], options: PlanOptions = {}) {
  const [snapshot, mentions] = await Promise.all([householdSnapshot(ctx), entityMentionMatcher(ctx)]);
  const index = skillIndexFor(permitted, user.role);
  const settings = options.settings ?? readAssistantSettings();
  const noThink = settings.thinking === false && usesNoThinkTag(settings.model);
  return (history: LoopMessage[]) => {
    const turn = planTurn(history, user.role, permitted, { mentions });
    return {
      systemPrompt: buildSystemPrompt(user, { skills: index, active: turn.skills, snapshot, noThink }),
      tools: turn.tools,
      skills: turn.skills.map((skill) => skill.id),
    };
  };
}

/** `screen`: the page the current question was asked from (its note goes with the question, tools see it). */
async function depsFor(user: SessionUser, conversationId: string, options: ChatOptions, model: ChatModel, screen: ResolvedScreen | null = null): Promise<LoopDeps> {
  const remembered = await db.assistantToolPreference.findMany({ where: { userId: user.id }, select: { toolName: true } });
  const permitted = toolsFor(user.role);
  const ctx = toolContext(user, options.signal, screen);
  const settings = options.settings ?? readAssistantSettings();
  return {
    model,
    tools: permitted,
    ctx,
    systemPrompt: "",
    plan: await planFor(user, ctx, permitted, { settings }),
    followUp: followUpFor(user.role, permitted),
    log: { conversationId, model: settings.model },
    questionNote: withScreenNote(questionNoteFor(user.locale), screen),
    onMeasure: options.onMeasure ?? logMeasure,
    rememberedSkips: new Set(remembered.map((row) => row.toolName)),
    emit: options.emit,
    save: async (message: NewLoopMessage) => {
      const row = await db.assistantMessage.create({
        data: {
          conversationId,
          role: message.role.toUpperCase() as MessageRow["role"],
          content: message.content,
          toolCalls: json(message.toolCalls),
          toolCallId: message.toolCallId ?? null,
          toolName: message.toolName ?? null,
          toolArgs: json(message.toolArgs),
          toolResult: json(message.toolResult),
          toolStatus: message.toolStatus ? fromStatus(message.toolStatus) : null,
          toolSummary: message.toolSummary ?? null,
          screen: json(message.screen),
        },
      });
      await db.assistantConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
      options.onSaved?.(row.id);
      return toLoopMessage(row);
    },
    update: async (id, patch) => {
      await db.assistantMessage.update({
        where: { id },
        data: {
          ...(patch.toolResult !== undefined && { toolResult: json(patch.toolResult) }),
          ...(patch.toolStatus && { toolStatus: fromStatus(patch.toolStatus) }),
          // Confirmed with edits or a choice: the arguments that ran, and their summary.
          ...(patch.toolArgs !== undefined && { toolArgs: json(patch.toolArgs) }),
          ...(patch.toolSummary !== undefined && { toolSummary: patch.toolSummary }),
        },
      });
    },
    remember: async (toolName) => {
      await db.assistantToolPreference.upsert({
        where: { userId_toolName: { userId: user.id, toolName } },
        create: { userId: user.id, toolName },
        update: {},
      });
    },
  };
}

/**
 * A new question: stored (in a new conversation when `conversationId` is null), then answered by the loop.
 * Events go to `options.emit`; the last one is `done`.
 */
export async function sendMessage(
  user: SessionUser,
  conversationId: string | null,
  input: AssistantMessageInput,
  options: ChatOptions,
): Promise<void> {
  const model = modelFor(options);
  const images = await uploadedImages(user, input.imageIds ?? [], options.settings ?? readAssistantSettings());
  const title = titleFromQuestion(input.content) || (user.locale === "nl" ? "Afbeelding" : "Image");
  const conversation = conversationId
    ? await findOwnConversation(user, conversationId)
    : await db.assistantConversation.create({ data: { userId: user.id, title } });
  // The page it was asked from: looked up for this household; anything else is silently left out.
  const screen = input.screen ? await resolveScreen(toolContext(user, options.signal), input.screen) : null;
  const deps = await depsFor(user, conversation.id, options, model, screen);
  const history = await loadHistory(conversation.id);
  // Confirmations left unanswered are answered as "not confirmed", so the history stays valid for the model.
  await cancelPending(history, deps);
  const question = await deps.save({ role: "user", content: input.content, ...(screen && { screen: storedScreen(screen) }) });
  if (images.length) {
    await db.assistantImage.updateMany({ where: { id: { in: images.map((image) => image.id) } }, data: { messageId: question.id } });
    question.images = images.map(toDataUrl);
  }
  history.push(question);
  options.emit({
    type: "start",
    conversationId: conversation.id,
    userMessageId: question.id,
    title: conversation.title,
    question: { content: input.content, images: images.map((image) => image.id), ...(screen && { screen: storedScreen(screen) }) },
  });
  const outcome = await runAssistantLoop(history, deps);
  options.emit({ type: "done", status: outcome });
}

/** The person confirmed or cancelled a pending tool call; the loop continues. */
export async function answerConfirmation(
  user: SessionUser,
  conversationId: string,
  messageId: string,
  input: AssistantConfirmationInput,
  options: ChatOptions,
): Promise<void> {
  const conversation = await findOwnConversation(user, conversationId);
  const history = await loadHistory(conversation.id);
  const pending = history.find((message) => message.id === messageId);
  if (!pending || pending.role !== "tool" || pending.toolStatus !== "pending") throw notFound("No such confirmation");
  // Cancelling works without a model; continuing the answer needs one.
  const model = modelFor(options);
  // The turn goes on with the screen of its question, looked up again (it may have changed since).
  const asked = history.findLast((message) => message.role === "user")?.screen;
  const screen = asked ? await resolveScreen(toolContext(user, options.signal), asked) : null;
  const deps = await depsFor(user, conversation.id, options, model, screen);
  if (input.decision === "confirm" && (input.edits || input.choice !== undefined)) {
    // Edits or a choice that don't validate answer 400 before anything streams; the card stays.
    const tool = deps.tools.find((candidate) => candidate.name === pending.toolName);
    if (tool) {
      try {
        await amendedArguments(tool, deps.ctx, pending.toolArgs, input);
      } catch (error) {
        if (error instanceof InvalidConfirmationError) throw badRequest(error.message);
        throw error;
      }
    }
  }
  options.emit({ type: "start", conversationId: conversation.id, userMessageId: null, title: conversation.title });
  try {
    const outcome = await resolveConfirmation(history, messageId, input, deps);
    options.emit({ type: "done", status: outcome });
  } catch (error) {
    if (error instanceof NotPendingError) throw notFound("No such confirmation");
    throw error;
  }
}

// ── Images ────────────────────────────────────────────────────────────────────────────────────────────

const toDataUrl = (image: { mimeType: string; data: Uint8Array }) => `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`;

/** The first bytes of each accepted type, so a renamed file can't pass as an image. */
function sniffImageType(data: Buffer): AssistantImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 12 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** An image for a question that is about to be sent (`POST /images`); linked to the question by `sendMessage`. */
export async function uploadImage(user: SessionUser, data: Buffer, settings: AssistantSettings = readAssistantSettings()): Promise<{ id: string }> {
  if (!settings.vision) throw conflict("Images are turned off for the assistant");
  if (data.length === 0 || data.length > ASSISTANT_IMAGE_MAX_BYTES) throw badRequest("The image is empty or too large");
  const mimeType = sniffImageType(data);
  if (!mimeType) throw badRequest("Only JPEG, PNG and WebP images are accepted");
  const row = await db.assistantImage.create({ data: { userId: user.id, mimeType, data: new Uint8Array(data) }, select: { id: true } });
  return { id: row.id };
}

/** An image of one of this person's questions (or one they just uploaded). */
export async function getImage(user: SessionUser, id: string): Promise<{ mimeType: string; data: Uint8Array }> {
  const row = await db.assistantImage.findFirst({ where: { id, userId: user.id }, select: { mimeType: true, data: true } });
  if (!row) throw notFound("Image not found");
  return row;
}

/**
 * The images a question refers to, in its order: this person's own uploads. One already sent with an earlier
 * question (Try again after an error) is copied, so each question keeps its own images.
 */
async function uploadedImages(user: SessionUser, ids: string[], settings: AssistantSettings) {
  if (!ids.length) return [];
  if (!settings.vision) throw badRequest("Images are turned off for the assistant");
  const rows = await db.assistantImage.findMany({ where: { id: { in: ids }, userId: user.id }, select: { id: true, mimeType: true, data: true, messageId: true } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const found = [...new Set(ids)].map((id) => byId.get(id));
  if (found.some((image) => !image)) throw badRequest("An attached image is missing; attach it again");
  return Promise.all(
    found
      .filter((image) => image !== undefined)
      .map(async (image) =>
        image.messageId === null
          ? image
          : db.assistantImage.create({ data: { userId: user.id, mimeType: image.mimeType, data: image.data }, select: { id: true, mimeType: true, data: true } }),
      ),
  );
}

/** Uploads that never became part of a question (the person removed them or left), after a day. */
export async function deleteUnsentImages(now = new Date()): Promise<number> {
  const { count } = await db.assistantImage.deleteMany({ where: { messageId: null, createdAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  return count;
}

/** Forget every "don't ask again" of this person. */
export async function resetToolPreferences(user: SessionUser): Promise<number> {
  const { count } = await db.assistantToolPreference.deleteMany({ where: { userId: user.id } });
  return count;
}

// ── Status ────────────────────────────────────────────────────────────────────────────────────────────

export function getStatus(user: SessionUser, settings: AssistantSettings = readAssistantSettings()): AssistantStatus {
  const host = settings.baseUrl ? new URL(settings.baseUrl).host : null;
  return {
    configured: settings.problem === null,
    problem: settings.problem,
    host,
    model: settings.model,
    stt: settings.sttUrl !== null,
    vision: settings.vision,
    tools: toolsFor(user.role).map((tool) => ({ name: tool.name, permission: tool.permission, activity: activityOf(tool, user.locale) })),
    skills: skillInfoFor(user),
  };
}

/** The capabilities list: every skill this person has, with its tools and how they confirm. */
export function skillInfoFor(user: Pick<SessionUser, "role" | "locale">): AssistantSkillInfo[] {
  const permitted = toolsFor(user.role);
  const ids = new Set(permitted.map((tool) => tool.skill));
  return skillsForRole(user.role)
    .filter((skill) => ids.has(skill.id))
    .map((skill) => ({
      id: skill.id,
      title: skill.title[user.locale] ?? skill.title.en,
      summary: skill.summary,
      tools: permitted
        .filter((tool) => tool.skill === skill.id)
        .map((tool) => ({ name: tool.name, permission: tool.permission, confirm: tool.confirm, activity: activityOf(tool, user.locale), core: tool.core === true })),
    }));
}

export const testConnection = (settings: AssistantSettings = readAssistantSettings()): Promise<ModelProbe> => probeModel(settings);

// ── MCP access tokens ─────────────────────────────────────────────────────────────────────────────────

const TOKEN_PREFIX = "wh_mcp_";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const MAX_TOKENS = 20;

const toToken = (row: { id: string; name: string; prefix: string; scope: "READ" | "WRITE"; lastUsedAt: Date | null; createdAt: Date }): AssistantAccessToken => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scope: row.scope === "WRITE" ? "write" : "read",
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export async function listTokens(user: SessionUser): Promise<AssistantAccessToken[]> {
  const rows = await db.assistantAccessToken.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return rows.map(toToken);
}

export async function createToken(user: SessionUser, input: AssistantTokenInput): Promise<CreatedAssistantToken> {
  const active = await db.assistantAccessToken.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= MAX_TOKENS) throw conflict("Too many tokens; revoke one first");
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await db.assistantAccessToken.create({
    data: {
      userId: user.id,
      name: input.name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 4),
      scope: input.scope === "write" ? "WRITE" : "READ",
    },
  });
  return { ...toToken(row), token };
}

export async function revokeToken(user: SessionUser, id: string): Promise<void> {
  const { count } = await db.assistantAccessToken.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!count) throw notFound("Token not found");
}

/**
 * Who an MCP request acts as: a personal `wh_mcp_` token or an OAuth access token (ai/core/mcp-oauth.ts).
 * `via` is the OAuth client's name, recorded in the audit log next to the person.
 */
export type TokenIdentity = { user: SessionUser; scope: "read" | "write"; tokenId: string; tokenName: string; via?: string };

const TOUCH_MS = 5 * 60_000;

/** The person behind a bearer token, or `null` (unknown, revoked, disabled account). */
export async function authenticateToken(token: string): Promise<TokenIdentity | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const row = await db.assistantAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { habitant: true, household: true } } },
  });
  if (!row || row.revokedAt || row.user.disabledAt) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_MS) {
    await db.assistantAccessToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  const { user } = row;
  return {
    tokenId: row.id,
    tokenName: row.name,
    scope: row.scope === "WRITE" ? "write" : "read",
    user: {
      id: user.id,
      email: user.email,
      name: user.habitant?.name ?? user.email,
      role: user.role.toLowerCase() as Role,
      locale: user.locale === "nl" ? "nl" : "en",
      householdId: user.householdId,
      householdName: user.household.name,
      habitantId: user.habitantId,
    },
  };
}
