import { ApiRequestError, api } from "@/lib/api-client";
import type { ApiError } from "@/types/common";
import type {
  AssistantAccessToken,
  AssistantConfirmationInput,
  AssistantConversationDetail,
  AssistantConversationSummary,
  AssistantMessageInput,
  AssistantProbe,
  AssistantSpeechInput,
  AssistantStatus,
  AssistantStreamEvent,
  AssistantTokenInput,
  AssistantTtsStatus,
  CreatedAssistantToken,
} from "../types/assistant";

/**
 * Everything the assistant's UI asks the server, behind one interface so stories and tests pass a fake.
 * The chat calls stream: the server answers a POST with `text/event-stream`, read here with `fetch`
 * (EventSource can't POST).
 */
export type AssistantClient = {
  status: () => Promise<AssistantStatus>;
  test: () => Promise<AssistantProbe>;
  listConversations: () => Promise<AssistantConversationSummary[]>;
  getConversation: (id: string) => Promise<AssistantConversationDetail>;
  renameConversation: (id: string, title: string) => Promise<AssistantConversationSummary>;
  deleteConversation: (id: string) => Promise<void>;
  /** A question, in a new conversation when `conversationId` is null. Resolves when the stream ends. */
  send: (conversationId: string | null, input: AssistantMessageInput, onEvent: (event: AssistantStreamEvent) => void, signal: AbortSignal) => Promise<void>;
  /**
   * Attach to the answer this conversation is still writing (after leaving the page or a dropped connection):
   * every event so far, then the rest. Resolves `false` at once when nothing is running.
   */
  attach: (conversationId: string, onEvent: (event: AssistantStreamEvent) => void, signal: AbortSignal) => Promise<boolean>;
  /** Stop the answer being written (closing the connection doesn't). */
  stop: (conversationId: string) => Promise<void>;
  confirm: (
    conversationId: string,
    messageId: string,
    input: AssistantConfirmationInput,
    onEvent: (event: AssistantStreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  transcribe: (audio: Blob, lang: "en" | "nl") => Promise<string>;
  /** An image for the next question (already resized); its id goes in `send`'s `imageIds`. */
  uploadImage: (image: Blob, signal?: AbortSignal) => Promise<{ id: string }>;
  /** The speech server's Dutch and English voices (server text-to-speech). */
  voices: () => Promise<AssistantTtsStatus>;
  /** One chunk of text spoken by the server voice, as audio (WAV). */
  speech: (input: AssistantSpeechInput, signal?: AbortSignal) => Promise<Blob>;
  listTokens: () => Promise<AssistantAccessToken[]>;
  createToken: (input: AssistantTokenInput) => Promise<CreatedAssistantToken>;
  revokeToken: (id: string) => Promise<void>;
  resetPreferences: () => Promise<void>;
};

/** Reads `data: <json>` events from a streamed response body. */
export async function readEventStream(response: Response, onEvent: (event: AssistantStreamEvent) => void): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as AssistantStreamEvent);
      } catch {
        // A broken line: skip it, the rest of the answer still shows.
      }
    }
  }
}

async function throwUnlessOk(response: Response) {
  if (response.ok) return;
  const payload = (await response.json().catch(() => null)) as ApiError | null;
  throw new ApiRequestError(response.status, payload?.error.code ?? "network", payload?.error.message ?? response.statusText, payload?.error.fields);
}

async function postStream(path: string, body: unknown, onEvent: (event: AssistantStreamEvent) => void, signal: AbortSignal) {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-WickedHome": "1", "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  await throwUnlessOk(response);
  await readEventStream(response, onEvent);
}

export const assistantClient: AssistantClient = {
  status: () => api.get<AssistantStatus>("/assistant/status"),
  test: () => api.post<AssistantProbe>("/assistant/status/test"),
  listConversations: () => api.get<AssistantConversationSummary[]>("/assistant/conversations"),
  getConversation: (id) => api.get<AssistantConversationDetail>(`/assistant/conversations/${encodeURIComponent(id)}`),
  renameConversation: (id, title) => api.patch<AssistantConversationSummary>(`/assistant/conversations/${encodeURIComponent(id)}`, { title }),
  deleteConversation: (id) => api.delete(`/assistant/conversations/${encodeURIComponent(id)}`),
  send: (conversationId, input, onEvent, signal) =>
    postStream(conversationId ? `/assistant/conversations/${encodeURIComponent(conversationId)}/messages` : "/assistant/conversations", input, onEvent, signal),
  attach: async (conversationId, onEvent, signal) => {
    const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(conversationId)}/stream`, {
      credentials: "same-origin",
      headers: { "X-WickedHome": "1", Accept: "text/event-stream" },
      signal,
    });
    await throwUnlessOk(response);
    if (response.status === 204) return false;
    await readEventStream(response, onEvent);
    return true;
  },
  stop: (conversationId) => api.post(`/assistant/conversations/${encodeURIComponent(conversationId)}/stop`),
  confirm: (conversationId, messageId, input, onEvent, signal) =>
    postStream(`/assistant/conversations/${encodeURIComponent(conversationId)}/confirmations/${encodeURIComponent(messageId)}`, input, onEvent, signal),
  transcribe: async (audio, lang) => {
    const response = await fetch(`/api/assistant/transcribe?lang=${lang}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-WickedHome": "1", "Content-Type": audio.type || "audio/webm" },
      body: audio,
    });
    const payload = (await response.json().catch(() => null)) as ({ text?: string } & Partial<ApiError>) | null;
    if (!response.ok) throw new ApiRequestError(response.status, payload?.error?.code ?? "network", payload?.error?.message ?? response.statusText);
    return payload?.text ?? "";
  },
  uploadImage: async (image, signal) => {
    const response = await fetch("/api/assistant/images", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-WickedHome": "1", "Content-Type": image.type || "application/octet-stream" },
      body: image,
      signal,
    });
    const payload = (await response.json().catch(() => null)) as ({ id?: string } & Partial<ApiError>) | null;
    if (!response.ok || !payload?.id) throw new ApiRequestError(response.status, payload?.error?.code ?? "network", payload?.error?.message ?? response.statusText);
    return { id: payload.id };
  },
  voices: () => api.get<AssistantTtsStatus>("/assistant/voices"),
  speech: async (input, signal) => {
    const response = await fetch("/api/assistant/speech", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-WickedHome": "1", "Content-Type": "application/json", Accept: "audio/wav, audio/*" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as Partial<ApiError> | null;
      throw new ApiRequestError(response.status, payload?.error?.code ?? "network", payload?.error?.message ?? response.statusText);
    }
    return response.blob();
  },
  listTokens: () => api.get<AssistantAccessToken[]>("/assistant/tokens"),
  createToken: (input) => api.post<CreatedAssistantToken>("/assistant/tokens", input),
  revokeToken: (id) => api.delete(`/assistant/tokens/${encodeURIComponent(id)}`),
  resetPreferences: () => api.delete("/assistant/preferences"),
};
