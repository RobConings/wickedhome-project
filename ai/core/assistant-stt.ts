import type { AssistantSettings } from "./assistant-config";

/**
 * Server speech-to-text: forwards a push-to-talk recording to an OpenAI-compatible
 * `/audio/transcriptions` endpoint (a local Whisper server: faster-whisper-server, whisper.cpp server,
 * LocalAI…) at `ASSISTANT_STT_URL`. The browser's own recognition is used when this isn't set up.
 */

export class TranscriptionError extends Error {
  constructor(
    readonly code: "not_configured" | "unreachable" | "timeout" | "failed",
    message: string,
  ) {
    super(message);
  }
}

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export async function transcribe(
  settings: Pick<AssistantSettings, "sttUrl" | "sttModel" | "apiKey">,
  audio: Buffer,
  contentType: string,
  language: "en" | "nl",
  timeoutMs = 60_000,
): Promise<string> {
  if (!settings.sttUrl) throw new TranscriptionError("not_configured", "Speech to text is not configured");
  const type = contentType.split(";")[0]?.trim().toLowerCase() || "audio/webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type }), `recording.${EXTENSIONS[type] ?? "webm"}`);
  form.append("model", settings.sttModel);
  form.append("language", language);
  form.append("response_format", "json");

  let response: Response;
  try {
    response = await fetch(`${settings.sttUrl}/audio/transcriptions`, {
      method: "POST",
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : undefined,
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new TranscriptionError(timeout ? "timeout" : "unreachable", timeout ? "Speech to text took too long" : "Speech to text server unreachable");
  }
  if (!response.ok) throw new TranscriptionError("failed", `Speech to text answered ${response.status}`);
  const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== "string") throw new TranscriptionError("failed", "Speech to text sent an unexpected answer");
  return body.text.trim();
}
