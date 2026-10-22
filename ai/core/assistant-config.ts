import { config } from "@/api/lib/config";
import { DEFAULT_TIMEOUTS, type ModelTimeouts } from "./llm-client";

/**
 * The assistant's server-wide settings, from `.env` (ai/docs/ASSISTANT.md). Read on every call so tests can
 * pass their own; the values themselves only change with a restart.
 */
export type AssistantSettings = {
  /** `http(s)://host:port/v1`, without a trailing slash; `null` when missing or invalid. */
  baseUrl: string | null;
  model: string | null;
  apiKey: string | null;
  sttUrl: string | null;
  sttModel: string;
  /**
   * Let the model reason before answering (`ASSISTANT_THINKING=on`). Off by default: a local model answers
   * several times faster without it, and household requests rarely need it.
   */
  thinking: boolean;
  /**
   * Questions may carry images, sent to the model as image parts (`ASSISTANT_VISION`, on unless `off`). Turn
   * it off for a model without image support: the chat then offers no attach button.
   */
  vision: boolean;
  /**
   * How long a model call may take, in seconds in `.env`: `ASSISTANT_TIMEOUT_FIRST_BYTE` (until the answer
   * starts, prompt reading included; default 300), `ASSISTANT_TIMEOUT_IDLE` (silence mid-answer; 60) and
   * `ASSISTANT_TIMEOUT_TOTAL` (the whole call; default none). Optional so tests can leave it out.
   */
  timeouts?: ModelTimeouts;
  /**
   * Model calls at once (`ASSISTANT_PARALLEL`, default 1): keep it equal to LM Studio's "Max Concurrent
   * Predictions". Others wait in the app's queue (ai/core/model-queue.ts), chats before the mail scan.
   */
  parallel?: number;
  /** Why it isn't usable, for the card: missing values or an invalid URL. */
  problem: "missing_url" | "missing_model" | "invalid_url" | null;
};

/** Whole seconds from `.env` as ms; empty, `0`, `off` or invalid → `fallback`. */
function secondsSetting(raw: string | undefined, fallback: number | null): number | null {
  const value = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : fallback;
}

export function readTimeouts(env: { ASSISTANT_TIMEOUT_FIRST_BYTE?: string; ASSISTANT_TIMEOUT_IDLE?: string; ASSISTANT_TIMEOUT_TOTAL?: string }): ModelTimeouts {
  return {
    firstByteMs: secondsSetting(env.ASSISTANT_TIMEOUT_FIRST_BYTE, DEFAULT_TIMEOUTS.firstByteMs) ?? DEFAULT_TIMEOUTS.firstByteMs,
    idleMs: secondsSetting(env.ASSISTANT_TIMEOUT_IDLE, DEFAULT_TIMEOUTS.idleMs) ?? DEFAULT_TIMEOUTS.idleMs,
    totalMs: secondsSetting(env.ASSISTANT_TIMEOUT_TOTAL, DEFAULT_TIMEOUTS.totalMs),
  };
}

/**
 * `http(s)://…` without query, hash or trailing slash, or `null`. A bare `http://host:port` gets `/v1`: every
 * OpenAI-compatible server (LM Studio, llama.cpp, Ollama, Speaches) serves its API there.
 */
export function normaliseBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    if (url.pathname === "/") url.pathname = "/v1";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function readAssistantSettings(env: {
  ASSISTANT_BASE_URL?: string;
  ASSISTANT_MODEL?: string;
  ASSISTANT_API_KEY?: string;
  ASSISTANT_TOKEN?: string;
  ASSISTANT_STT_URL?: string;
  ASSISTANT_STT_MODEL?: string;
  ASSISTANT_THINKING?: string;
  ASSISTANT_VISION?: string;
  ASSISTANT_TIMEOUT_FIRST_BYTE?: string;
  ASSISTANT_TIMEOUT_IDLE?: string;
  ASSISTANT_TIMEOUT_TOTAL?: string;
  ASSISTANT_PARALLEL?: string;
} = config): AssistantSettings {
  const baseUrl = normaliseBaseUrl(env.ASSISTANT_BASE_URL);
  const model = env.ASSISTANT_MODEL?.trim() || null;
  const problem = !env.ASSISTANT_BASE_URL ? "missing_url" : !baseUrl ? "invalid_url" : !model ? "missing_model" : null;
  return {
    baseUrl,
    model,
    apiKey: env.ASSISTANT_API_KEY?.trim() || env.ASSISTANT_TOKEN?.trim() || null,
    sttUrl: normaliseBaseUrl(env.ASSISTANT_STT_URL),
    sttModel: env.ASSISTANT_STT_MODEL?.trim() || "whisper-1",
    thinking: /^(on|true|1|yes)$/i.test(env.ASSISTANT_THINKING?.trim() ?? ""),
    vision: !/^(off|false|0|no)$/i.test(env.ASSISTANT_VISION?.trim() ?? ""),
    timeouts: readTimeouts(env),
    parallel: Math.min(8, Math.max(1, Math.floor(Number(env.ASSISTANT_PARALLEL?.trim()) || 1))),
    problem,
  };
}

export const isAssistantConfigured = (settings: AssistantSettings = readAssistantSettings()) => settings.problem === null;

// ── Speech output ─────────────────────────────────────────────────────────────────────────────────────

export const TTS_KINDS = ["piper", "openai"] as const;
export type TtsKind = (typeof TTS_KINDS)[number];

/** Server text-to-speech (ai/core/assistant-tts.ts). Separate from the model settings: it works on its own. */
export type TtsSettings = {
  /** `http(s)://host:port[/path]` without a trailing slash (nothing appended); `null` when missing or invalid. */
  url: string | null;
  kind: TtsKind;
  /** The openai kind's `model` (default `tts-1`). */
  model: string;
  /** The voice per language when the person didn't choose one. */
  voices: { nl: string; en: string };
  /** 0.5–2 (1 = normal; piper gets `length_scale = 1 / speed`); `null` = the voice's own pace. */
  speed: number | null;
  /** Sent as `Authorization: Bearer …` to the openai kind (`ASSISTANT_TOKEN` / `ASSISTANT_API_KEY`). */
  apiKey: string | null;
  /**
   * What is wrong, for the card. `invalid_url` and `invalid_kind` switch server speech off (the browser's voice
   * is used); `invalid_speed` only ignores the speed.
   */
  problem: "invalid_url" | "invalid_kind" | "invalid_speed" | null;
};

export const DEFAULT_TTS_VOICES = { nl: "nl_BE-nathalie-medium", en: "en_GB-alba-medium" } as const;

/** Like `normaliseBaseUrl`, but the path is kept as given: Piper serves at the root, not under `/v1`. */
export function normaliseTtsUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function readTtsSettings(env: {
  ASSISTANT_TTS_URL?: string;
  ASSISTANT_TTS_KIND?: string;
  ASSISTANT_TTS_MODEL?: string;
  ASSISTANT_TTS_VOICE_NL?: string;
  ASSISTANT_TTS_VOICE_EN?: string;
  ASSISTANT_TTS_SPEED?: string;
  ASSISTANT_API_KEY?: string;
  ASSISTANT_TOKEN?: string;
} = config): TtsSettings {
  const rawUrl = env.ASSISTANT_TTS_URL?.trim();
  const url = normaliseTtsUrl(rawUrl);
  const rawKind = env.ASSISTANT_TTS_KIND?.trim().toLowerCase() || "piper";
  const kindValid = (TTS_KINDS as readonly string[]).includes(rawKind);
  const rawSpeed = env.ASSISTANT_TTS_SPEED?.trim().replace(",", ".");
  const parsedSpeed = rawSpeed ? Number(rawSpeed) : null;
  const speedValid = parsedSpeed === null || (Number.isFinite(parsedSpeed) && parsedSpeed >= 0.5 && parsedSpeed <= 2);
  const problem = rawUrl && !url ? "invalid_url" : !kindValid ? "invalid_kind" : !speedValid ? "invalid_speed" : null;
  return {
    url: problem === "invalid_kind" ? null : url,
    kind: kindValid ? (rawKind as TtsKind) : "piper",
    model: env.ASSISTANT_TTS_MODEL?.trim() || "tts-1",
    voices: {
      nl: env.ASSISTANT_TTS_VOICE_NL?.trim() || DEFAULT_TTS_VOICES.nl,
      en: env.ASSISTANT_TTS_VOICE_EN?.trim() || DEFAULT_TTS_VOICES.en,
    },
    speed: speedValid && parsedSpeed !== null && parsedSpeed !== 1 ? parsedSpeed : null,
    apiKey: env.ASSISTANT_API_KEY?.trim() || env.ASSISTANT_TOKEN?.trim() || null,
    problem,
  };
}
