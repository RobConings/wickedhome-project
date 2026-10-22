import { z } from "zod";
import { idSchema } from "@/types/common";
import { screenRefSchema, type ScreenContext } from "@/types/screen-context";

/**
 * The assistant's contract, shared by ai/core and the chat UI. See ai/docs/ASSISTANT.md.
 */

// ── Tool calls ────────────────────────────────────────────────────────────────────────────────────────

export const ASSISTANT_TOOL_STATUSES = ["pending", "done", "failed", "cancelled"] as const;
export type AssistantToolStatus = (typeof ASSISTANT_TOOL_STATUSES)[number];

export type AssistantToolPermission = "read" | "write" | "sensitive";

/** What a tool returns to the model. */
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * A proposed change shown on a confirmation card before Confirm. `kind` picks the renderer: built in are
 * `list` (`{ items: { label, detail?, tone?: "add" | "change" | "remove" }[] }`) and `fields`
 * (`{ fields: { label, value }[] }`); features register more (e.g. `plan-diff`, drawn over the floor plan)
 * with `registerAssistantPreviewRenderer` from `@/features/assistant`. Unknown kinds show only the summary.
 */
export type AssistantPreviewPayload = {
  kind: string;
  /** Optional heading above the preview, in the person's language. */
  title?: string;
  data: unknown;
};

export type AssistantPreviewListItem = { label: string; detail?: string; tone?: "add" | "change" | "remove" };

/**
 * What a confirmation card offers besides Confirm / Cancel (a tool's `confirmation`, ai/docs/ADDING-TOOLS.md):
 * `editable` argument names the person may change on the card (the preview renderer shows the inputs), and
 * `choices`, buttons that replace Confirm (e.g. "Send" and "Save as draft"), labels in the person's language.
 */
export type AssistantConfirmOptions = {
  editable: string[];
  choices: { value: string; label: string }[];
};

// ── Streaming ─────────────────────────────────────────────────────────────────────────────────────────

/** Notices the chat shows inline: the model has no tool support, or the step limit was reached. */
export type AssistantNoticeCode = "no_tools" | "max_steps";

/**
 * Why the answer hasn't started yet, shown instead of "Thinking…" until the next event: waiting for another
 * conversation (one model call at a time), or the model server restarting (tried once more).
 */
export type AssistantStatusCode = "queued" | "restarting";

/**
 * One event of a streamed answer (`POST …/messages` and `POST …/confirmations/:id` answer with
 * `text/event-stream`, one `data: <json>` line per event).
 */
export type AssistantStreamEvent =
  /**
   * The question was stored (first event of a new message). `question`: what was asked, for a chat that
   * attaches to a running answer later (the stored question is left out of the detail until it ends).
   */
  | {
      type: "start";
      conversationId: string;
      userMessageId: string | null;
      title: string | null;
      /** `screen`: the page it was asked from, as the server found it (absent: none, or not found). */
      question?: { content: string; images: string[]; screen?: ScreenContext };
    }
  /** A piece of the answer's text. */
  | { type: "text"; text: string }
  /** An assistant message was stored (text and/or tool calls). */
  | { type: "message"; messageId: string; role: "assistant" }
  /** A tool started, finished, failed or was cancelled. `label` is the activity text in the person's language. */
  | { type: "tool"; messageId: string | null; toolCallId: string; name: string; status: AssistantToolStatus | "running"; label: string }
  /** A write waits for the person: show a confirmation card. */
  | {
      type: "confirm";
      messageId: string;
      toolCallId: string;
      name: string;
      summary: string;
      permission: AssistantToolPermission;
      /** "Don't ask again" may be offered (harmless writes only). */
      allowRemember: boolean;
      /** What the change looks like, when the tool can show it. */
      preview?: AssistantPreviewPayload | null;
      /** Edits and choices the card offers (absent: Confirm / Cancel only). */
      options?: AssistantConfirmOptions | null;
    }
  | { type: "notice"; code: AssistantNoticeCode }
  /** A passing state (`null`: over); never stored. */
  | { type: "status"; code: AssistantStatusCode | null }
  | { type: "error"; code: string; message: string }
  /** Last event: answered, or paused for a confirmation. */
  | { type: "done"; status: "done" | "paused" | "error" };

// ── Read models ───────────────────────────────────────────────────────────────────────────────────────

export type AssistantConversationSummary = {
  id: string;
  title: string | null;
  /** ISO timestamps */
  lastMessageAt: string;
  createdAt: string;
};

/** A message as the chat shows it. Tool messages carry their chip / confirmation state. */
export type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  /** User messages: ids of the attached images (`assistantImageUrl`). */
  images?: string[];
  /** User messages: the page the question was asked from (screen context), with the label the server found. */
  screen?: ScreenContext;
  /** Tool messages only. */
  tool: {
    name: string;
    status: AssistantToolStatus;
    /** The activity text, or what will happen while pending. */
    summary: string | null;
    permission: AssistantToolPermission | null;
    allowRemember: boolean;
    /** The error the tool returned, when it failed. */
    error: string | null;
    /** Pending confirmations: the proposed change, when the tool can show it. */
    preview?: AssistantPreviewPayload | null;
    /** Pending confirmations: edits and choices the card offers. */
    options?: AssistantConfirmOptions | null;
  } | null;
};

export type AssistantConversationDetail = AssistantConversationSummary & {
  messages: AssistantMessage[];
  /** An answer is still being written (also after the page was left): attach with `GET …/stream`. */
  running?: boolean;
};

export type AssistantProblem = "missing_url" | "missing_model" | "invalid_url";

/** `GET /api/assistant/status`. Never includes the API key. */
export type AssistantStatus = {
  configured: boolean;
  problem: AssistantProblem | null;
  /** Host and port of the model server, e.g. `192.168.1.20:1234`. */
  host: string | null;
  model: string | null;
  /** Server speech-to-text is set up (`ASSISTANT_STT_URL`). */
  stt: boolean;
  /** Questions may carry images (`ASSISTANT_VISION`, on by default; the model must support images). */
  vision?: boolean;
  /** Tools this person may use, for the card. */
  tools: { name: string; permission: AssistantToolPermission; activity: string }[];
  /** The skills this person has, with their tools: the capabilities list. */
  skills?: AssistantSkillInfo[];
  /** Server text-to-speech (`ASSISTANT_TTS_URL`); without it answers are read by the browser's voice. */
  tts?: AssistantTtsStatus;
  /** Web search for the assistant (`SEARCH_URL`, a self-hosted SearXNG); without it the web skill isn't offered. */
  web?: AssistantWebStatus;
};

/** `web` in the status. Host and port only, never the full URL. */
export type AssistantWebStatus = {
  configured: boolean;
  /** The search server answered a quick check; `null` when not configured. */
  ok: boolean | null;
  host: string | null;
  problem: "invalid_url" | null;
};

/** A voice of the speech server. `locale` is `null` when the id doesn't say (some openai-kind servers). */
export type AssistantVoice = { id: string; locale: "en" | "nl" | null };

export type AssistantTtsProblem = "invalid_url" | "invalid_kind" | "invalid_speed";

/** `GET /api/assistant/voices`, and `tts` in the status. */
export type AssistantTtsStatus = {
  /** `ASSISTANT_TTS_URL` is set and valid. */
  configured: boolean;
  /** The server answered the last check; `null` when not configured. */
  ok: boolean | null;
  kind: "piper" | "openai";
  /** Host and port of the speech server. */
  host: string | null;
  problem: AssistantTtsProblem | null;
  /** Dutch and English voices only. */
  voices: AssistantVoice[];
  /** The voice used per language when the person didn't pick one on this device. */
  defaults: { en: string; nl: string };
};

export type AssistantToolConfirmMode = "never" | "first-time" | "always";

/** A skill as the capabilities list shows it. */
export type AssistantSkillInfo = {
  id: string;
  title: string;
  summary: string;
  tools: { name: string; permission: AssistantToolPermission; confirm: AssistantToolConfirmMode; activity: string; core: boolean }[];
};

/** `POST /api/assistant/status/test`: reachability and a one-token round trip. */
export type AssistantProbe = {
  reachable: boolean;
  latencyMs: number | null;
  models: string[];
  modelListed: boolean | null;
  error: string | null;
};

export const ASSISTANT_TOKEN_SCOPES = ["read", "write"] as const;
export type AssistantTokenScope = (typeof ASSISTANT_TOKEN_SCOPES)[number];

/** A personal MCP access token, as listed (never the token itself). */
export type AssistantAccessToken = {
  id: string;
  name: string;
  prefix: string;
  scope: AssistantTokenScope;
  lastUsedAt: string | null;
  createdAt: string;
};

/** `POST /api/assistant/tokens`: the token is in this answer only, once. */
export type CreatedAssistantToken = AssistantAccessToken & { token: string };

// ── Input schemas ─────────────────────────────────────────────────────────────────────────────────────

export const ASSISTANT_MESSAGE_MAX = 4000;

/** Longest text per `POST /api/assistant/speech`: one sentence-ish chunk (the browser splits answers). */
export const ASSISTANT_SPEECH_MAX = 600;

export const assistantSpeechInputSchema = z.object({
  text: z.string().trim().min(1).max(ASSISTANT_SPEECH_MAX),
  locale: z.enum(["en", "nl"]),
  /** One of the server's voices; the language's default when left out. */
  voice: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[\w.:+-]+$/)
    .optional(),
});
export type AssistantSpeechInput = z.infer<typeof assistantSpeechInputSchema>;

/** Images per question, the largest upload (after resizing in the browser) and the types accepted. */
export const ASSISTANT_IMAGES_MAX = 4;
export const ASSISTANT_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const ASSISTANT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AssistantImageType = (typeof ASSISTANT_IMAGE_TYPES)[number];
/** Longest side of an attached image, in pixels (the browser resizes before uploading). */
export const ASSISTANT_IMAGE_MAX_SIDE = 2048;

/** Where the chat shows an attached image (the same session cookie as the rest of the app). */
export const assistantImageUrl = (id: string) => `/api/assistant/images/${encodeURIComponent(id)}`;

export const assistantMessageInputSchema = z
  .object({
    content: z.string().trim().max(ASSISTANT_MESSAGE_MAX).default(""),
    /** Typed or spoken: spoken answers can be read aloud. */
    voice: z.boolean().default(false),
    /** Images uploaded with `POST /api/assistant/images`, in order. */
    imageIds: z.array(idSchema).max(ASSISTANT_IMAGES_MAX).optional(),
    /** The page the chat was opened from (screen context); the server looks it up and ignores what isn't the household's. */
    screen: screenRefSchema.optional(),
  })
  .refine((input) => input.content !== "" || (input.imageIds?.length ?? 0) > 0, { message: "Ask something or attach an image", path: ["content"] });
export type AssistantMessageInput = z.infer<typeof assistantMessageInputSchema>;

export const assistantConfirmationInputSchema = z.object({
  decision: z.enum(["confirm", "cancel"]),
  remember: z.boolean().default(false),
  /** Arguments changed on the card (only the tool's editable ones are accepted; validated by the tool again). */
  edits: z
    .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), z.union([z.string().max(20_000), z.number(), z.boolean(), z.null()]))
    .refine((value) => Object.keys(value).length <= 10, { message: "Too many edits" })
    .optional(),
  /** The choice button picked (one of the card's `options.choices`). */
  choice: z.string().trim().min(1).max(40).optional(),
});
export type AssistantConfirmationInput = z.infer<typeof assistantConfirmationInputSchema>;

export const assistantRenameInputSchema = z.object({ title: z.string().trim().min(1).max(80) });
export type AssistantRenameInput = z.infer<typeof assistantRenameInputSchema>;

export const assistantTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(ASSISTANT_TOKEN_SCOPES).default("read"),
});
export type AssistantTokenInput = z.infer<typeof assistantTokenInputSchema>;

/** Conversations without activity are deleted after this many days (`assistant.cleanup`). */
export const CONVERSATION_RETENTION_DAYS = 90;

/** A title from the first question: its first line, cut to 60 characters. */
export function titleFromQuestion(question: string): string {
  const line = question.trim().split(/\r?\n/)[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}
