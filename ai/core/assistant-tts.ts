import type { AssistantSpeechInput, AssistantTtsStatus, AssistantVoice } from "@/features/assistant/types/assistant";
import { readTtsSettings, type TtsSettings } from "./assistant-config";

/**
 * Server text-to-speech for reading answers aloud (ai/docs/ASSISTANT.md "Speech output"). Two kinds of server:
 *
 * - `piper` (default): the Piper HTTP server (`python -m piper.http_server`), `GET /voices` and
 *   `POST /synthesize {text, voice, length_scale}` → WAV;
 * - `openai`: an OpenAI-compatible `POST <url>/audio/speech {model, voice, input, response_format: "wav"}`
 *   (Speaches, Kokoro-FastAPI, Chatterbox… on a GPU machine), voices from `GET <url>/audio/voices` when the
 *   server lists them, otherwise the configured ones.
 *
 * The browser sends one sentence-ish chunk at a time and plays the first while the next is generated. The audio
 * is streamed straight through to the browser: nothing is written to disk. Without `ASSISTANT_TTS_URL` the
 * browser's own `speechSynthesis` is used.
 */

export class SpeechError extends Error {
  constructor(
    readonly code: "not_configured" | "invalid_voice" | "unreachable" | "timeout" | "failed" | "aborted",
    message: string,
  ) {
    super(message);
  }
}

/** One chunk may take this long, request and audio together. */
export const SPEECH_TIMEOUT_MS = 20_000;
/** A good voice list is reused this long; a failed check is retried sooner. */
const VOICES_TTL_MS = 5 * 60_000;
const VOICES_RETRY_MS = 30_000;

export type VoiceList = {
  /** The server answered. */
  ok: boolean;
  voices: AssistantVoice[];
  /** The server listed its voices (else `voices` are the configured defaults, openai kind only). */
  listed: boolean;
};

let cache: { key: string; at: number; value: VoiceList } | null = null;
let inflight: { key: string; promise: Promise<VoiceList> } | null = null;
/** Told about every fresh look at the server (the warm-up, `startTtsWarmup`). */
let voiceListObserver: ((settings: TtsSettings, list: VoiceList) => void) | null = null;
/** Chunks being synthesized for people right now: the warm-up waits for them. */
let activeSyntheses = 0;

/** Forget the cached voice list (tests). */
export function clearVoiceCache() {
  cache = null;
  inflight = null;
}

const cacheKey = (settings: TtsSettings) => `${settings.kind} ${settings.url} ${settings.voices.nl} ${settings.voices.en}`;

/** `nl` / `en` from Piper's `language.family` or an id such as `nl_BE-…`, `en-gb-…`; else `null`. */
function localeOf(id: string, family?: unknown): "en" | "nl" | null {
  const code = (typeof family === "string" ? family : /^([a-z]{2})(?:[_-]|$)/i.exec(id)?.[1])?.toLowerCase();
  return code === "nl" || code === "en" ? code : null;
}

const byId = (a: AssistantVoice, b: AssistantVoice) => a.id.localeCompare(b.id);

const configuredVoices = (settings: TtsSettings): AssistantVoice[] =>
  [...new Set([settings.voices.nl, settings.voices.en])].map((id) => ({ id, locale: localeOf(id) ?? (id === settings.voices.nl ? "nl" : "en") }));

const authHeaders = (settings: TtsSettings): Record<string, string> =>
  settings.kind === "openai" && settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {};

/** Voice ids out of the shapes openai-kind servers use: `["a"]`, `{voices: […]}`, `{data: […]}`, objects with `id`/`name`. */
function openAiVoiceIds(body: unknown): string[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? ((body as { voices?: unknown }).voices ?? (body as { data?: unknown }).data)
      : null;
  if (!Array.isArray(list)) return [];
  return list
    .map((item: unknown) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? ((item as { id?: unknown }).id ?? (item as { voice_id?: unknown }).voice_id ?? (item as { name?: unknown }).name)
          : null,
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 120);
}

async function fetchVoices(settings: TtsSettings & { url: string }, timeoutMs: number): Promise<VoiceList> {
  const path = settings.kind === "piper" ? "/voices" : "/audio/voices";
  let response: Response;
  try {
    response = await fetch(`${settings.url}${path}`, { redirect: "error", headers: authHeaders(settings), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { ok: false, voices: settings.kind === "openai" ? configuredVoices(settings) : [], listed: false };
  }
  const body = response.ok ? ((await response.json().catch(() => null)) as unknown) : null;
  if (settings.kind === "piper") {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, voices: [], listed: false };
    const voices = Object.entries(body as Record<string, { language?: { family?: unknown } } | null>)
      .map(([id, info]) => ({ id, locale: localeOf(id, info?.language?.family) }))
      .filter((voice) => voice.locale !== null)
      .sort(byId);
    return { ok: true, voices, listed: true };
  }
  // openai kind: any answer means the server is there; not every server lists voices.
  const ids = openAiVoiceIds(body);
  if (ids.length === 0) return { ok: true, voices: configuredVoices(settings), listed: false };
  // Ids with a language-region prefix (`nl_BE-…`, `en-US-…`) keep only Dutch and English; others can't be told apart.
  const voices = ids
    .filter((id) => {
      const code = /^([a-z]{2})[_-][a-z]{2}(?:[_-]|$)/i.exec(id)?.[1]?.toLowerCase();
      return !code || code === "nl" || code === "en";
    })
    .map((id) => ({ id, locale: /^(nl|en)[_-][a-z]{2}(?:[_-]|$)/i.test(id) ? localeOf(id) : null }))
    .sort(byId);
  return { ok: true, voices, listed: true };
}

/** The server's Dutch and English voices, cached (5 minutes; a failed check 30 seconds). */
export async function listVoices(settings: TtsSettings = readTtsSettings(), options: { timeoutMs?: number; fresh?: boolean } = {}): Promise<VoiceList> {
  if (!settings.url) return { ok: false, voices: [], listed: false };
  const key = cacheKey(settings);
  const now = Date.now();
  if (!options.fresh && cache?.key === key && now - cache.at < (cache.value.ok ? VOICES_TTL_MS : VOICES_RETRY_MS)) return cache.value;
  if (inflight?.key === key) return inflight.promise;
  const promise = fetchVoices({ ...settings, url: settings.url }, options.timeoutMs ?? 5_000).then((value) => {
    cache = { key, at: Date.now(), value };
    voiceListObserver?.(settings, value);
    return value;
  });
  inflight = { key, promise };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

/** For the status card and `GET /api/assistant/voices`. Never throws. */
export async function ttsStatus(settings: TtsSettings = readTtsSettings(), timeoutMs = 2_500): Promise<AssistantTtsStatus> {
  const base = {
    configured: settings.url !== null,
    kind: settings.kind,
    host: settings.url ? new URL(settings.url).host : null,
    problem: settings.problem,
    defaults: { en: settings.voices.en, nl: settings.voices.nl },
  };
  if (!settings.url) return { ...base, ok: null, voices: [] };
  const list = await listVoices(settings, { timeoutMs }).catch(() => ({ ok: false, voices: [], listed: false }));
  return { ...base, ok: list.ok, voices: list.voices };
}

/** The voice to use: the requested one when the server has it, else the language's default (or its first voice). */
async function resolveVoice(settings: TtsSettings, locale: "en" | "nl", requested: string | undefined): Promise<string> {
  let list = await listVoices(settings);
  const has = (id: string) => list.voices.some((voice) => voice.id === id);
  // A voice added since the last check, or a server that just came back: look once more before refusing.
  if (!list.ok || (requested && !has(requested))) list = await listVoices(settings, { fresh: true });
  if (!list.ok) throw new SpeechError("unreachable", "Speech server unreachable");
  if (requested) {
    if (!has(requested)) throw new SpeechError("invalid_voice", "The speech server has no such voice");
    return requested;
  }
  const preferred = settings.voices[locale];
  if (has(preferred)) return preferred;
  return list.voices.find((voice) => voice.locale === locale)?.id ?? preferred;
}

/** Reads until at least `bytes` bytes arrived (or the stream ended), as one array. */
async function readAtLeast(reader: ReadableStreamDefaultReader<Uint8Array>, bytes: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < bytes) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
  }
  return parts.length === 1 ? parts[0]! : new Uint8Array(Buffer.concat(parts));
}

export type SynthesizedSpeech = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
  voice: string;
};

/**
 * One chunk of speech. Resolves as soon as the server starts answering; the caller streams `body` on. `signal`
 * aborts the upstream request (the browser went away); the whole thing times out after `timeoutMs`.
 */
export async function synthesize(
  settings: TtsSettings,
  input: AssistantSpeechInput,
  signal?: AbortSignal,
  timeoutMs = SPEECH_TIMEOUT_MS,
): Promise<SynthesizedSpeech> {
  activeSyntheses += 1;
  try {
    return await requestSpeech(settings, input, signal, timeoutMs);
  } finally {
    activeSyntheses -= 1;
  }
}

async function requestSpeech(settings: TtsSettings, input: AssistantSpeechInput, signal: AbortSignal | undefined, timeoutMs: number): Promise<SynthesizedSpeech> {
  if (!settings.url) throw new SpeechError("not_configured", "Speech output is not configured");
  const voice = await resolveVoice(settings, input.locale, input.voice);
  if (signal?.aborted) throw new SpeechError("aborted", "Cancelled");

  const timeout = AbortSignal.timeout(timeoutMs);
  const request =
    settings.kind === "piper"
      ? {
          path: "/synthesize",
          body: { text: input.text, voice, ...(settings.speed ? { length_scale: Math.round((1 / settings.speed) * 1000) / 1000 } : {}) },
        }
      : {
          path: "/audio/speech",
          body: { model: settings.model, voice, input: input.text, response_format: "wav", ...(settings.speed ? { speed: settings.speed } : {}) },
        };

  let response: Response;
  try {
    response = await fetch(`${settings.url}${request.path}`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "audio/wav, audio/*", ...authHeaders(settings) },
      body: JSON.stringify(request.body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    if (signal?.aborted) throw new SpeechError("aborted", "Cancelled");
    if (timeout.aborted) throw new SpeechError("timeout", "Speech took too long");
    throw new SpeechError("unreachable", "Speech server unreachable");
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new SpeechError("failed", `Speech server answered ${response.status}`);
  }
  // Piper labels its WAV `text/html`, so look at the bytes: a WAV starts with "RIFF". Other audio is accepted
  // when the server says it is audio.
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const reader = response.body.getReader();
  let first: Uint8Array;
  try {
    first = await readAtLeast(reader, 4);
  } catch {
    if (signal?.aborted) throw new SpeechError("aborted", "Cancelled");
    if (timeout.aborted) throw new SpeechError("timeout", "Speech took too long");
    throw new SpeechError("failed", "Speech server broke off");
  }
  const wav = first.length >= 4 && String.fromCharCode(...first.subarray(0, 4)) === "RIFF";
  if (!wav && !type.startsWith("audio/")) {
    await reader.cancel().catch(() => undefined);
    throw new SpeechError("failed", "Speech server sent an unexpected answer");
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  const length = Number(response.headers.get("content-length"));
  return {
    body,
    contentType: wav ? "audio/wav" : type,
    contentLength: Number.isInteger(length) && length > 0 ? length : null,
    voice,
  };
}

// ── Warm-up ───────────────────────────────────────────────────────────────────────────────────────────
// Piper loads a voice other than its default on first use, which takes seconds: in the middle of an answer
// read aloud, or before its first sentence. So once the app is up, and whenever the speech server comes back
// after being unreachable, every Dutch and English voice it lists says one short word, one voice at a time,
// after any speech that is being made for someone. Errors are ignored: it is only a head start.

const WARM_TEXT = { nl: "Oké.", en: "Okay." } as const;
/** How long the warm-up waits for people's speech before it goes ahead anyway. */
const WARM_WAIT_MS = 60_000;
const WARM_POLL_MS = 500;

export type TtsWarmupDeps = {
  readSettings: () => TtsSettings;
  /** A fresh look at the server's voices. */
  check: (settings: TtsSettings) => Promise<VoiceList>;
  /** Synthesizes `text` in `voice` and throws the audio away. */
  speak: (settings: TtsSettings, voice: string, locale: "en" | "nl", text: string) => Promise<void>;
  /** Speech is being made for someone right now. */
  busy: () => boolean;
  sleep: (ms: number) => Promise<void>;
};

/** The warm-up's logic, with its clock and server calls passed in (tests). `observe` gets every fresh voice list. */
export function createTtsWarmup(deps: TtsWarmupDeps) {
  let reachable: boolean | null = null;
  let warming: Promise<void> | null = null;

  async function warm(settings: TtsSettings, voices: AssistantVoice[]) {
    for (const voice of voices) {
      if (voice.locale !== "nl" && voice.locale !== "en") continue;
      for (let waited = 0; deps.busy() && waited < WARM_WAIT_MS; waited += WARM_POLL_MS) await deps.sleep(WARM_POLL_MS);
      try {
        await deps.speak(settings, voice.id, voice.locale, WARM_TEXT[voice.locale]);
      } catch {
        // Only a head start.
      }
    }
  }

  /** A look at the server: warms its voices when it is reachable now and wasn't (or wasn't known to be) before. */
  function observe(settings: TtsSettings, list: VoiceList): Promise<void> | null {
    const was = reachable;
    reachable = list.ok;
    if (list.ok && list.listed && was !== true && !warming) {
      warming = warm(settings, list.voices).finally(() => {
        warming = null;
      });
    }
    return warming;
  }

  /** Looks at the server now (the app started, or the periodic check). Resolves when any warm-up it started is done. */
  async function probe(): Promise<void> {
    const settings = deps.readSettings();
    if (!settings.url) return;
    const list = await deps.check(settings).catch((): VoiceList => ({ ok: false, voices: [], listed: false }));
    await observe(settings, list);
  }

  return { observe, probe, warming: () => warming };
}

async function discard(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (!(await reader.read()).done) {
      // Read and dropped.
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Starts the warm-up with the server (server.ts): a look right away and then every `intervalMs`, so a speech
 * server that comes back is noticed; every other look at the voices counts too. Returns a stop function.
 * `readSettings` replaces the configured server (tests).
 */
export function startTtsWarmup({ intervalMs = 60_000, readSettings = () => readTtsSettings() }: { intervalMs?: number; readSettings?: () => TtsSettings } = {}): () => void {
  const warmup = createTtsWarmup({
    readSettings,
    check: (settings) => listVoices(settings, { fresh: true }),
    speak: async (settings, voice, locale, text) => {
      const speech = await requestSpeech(settings, { text, locale, voice }, undefined, SPEECH_TIMEOUT_MS);
      await discard(speech.body);
    },
    busy: () => activeSyntheses > 0,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref()),
  });
  voiceListObserver = (settings, list) => void warmup.observe(settings, list);
  void warmup.probe();
  const timer = setInterval(() => void warmup.probe(), intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    voiceListObserver = null;
  };
}
