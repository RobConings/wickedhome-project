import {
  assistantImageUrl,
  type AssistantConfirmOptions,
  type AssistantMessage,
  type AssistantNoticeCode,
  type AssistantPreviewPayload,
  type AssistantStatusCode,
  type AssistantStreamEvent,
  type AssistantToolPermission,
  type AssistantToolStatus,
} from "../types/assistant";
import type { ScreenContext } from "@/types/screen-context";

/**
 * What the chat shows, as a list of items: questions, answers (streaming while they arrive), tool activity
 * chips, confirmation cards, notices and errors. Built from the stored messages and then updated by the
 * stream events. Pure, so it can be tested and used in stories.
 */
export type ChatItem =
  /**
   * `images`: attached images, `url` to show (an object URL right after sending), `id` to send again.
   * `screen`: the page it was asked about (the chip on the question; sent again with Try again).
   */
  | { kind: "user"; key: string; text: string; images?: ChatImage[]; screen?: ScreenContext }
  | { kind: "assistant"; key: string; text: string; streaming: boolean }
  | { kind: "tool"; key: string; toolCallId: string | null; messageId: string | null; name: string; status: AssistantToolStatus | "running"; label: string; error: string | null }
  | {
      kind: "confirm";
      key: string;
      messageId: string;
      name: string;
      summary: string;
      permission: AssistantToolPermission;
      allowRemember: boolean;
      /** The proposed change, when the tool can show it. */
      preview?: AssistantPreviewPayload | null;
      /** Edits and choice buttons the card offers. */
      options?: AssistantConfirmOptions | null;
      /** While the decision is being sent. */
      submitting: "confirm" | "cancel" | null;
    }
  | { kind: "notice"; key: string; code: AssistantNoticeCode }
  | { kind: "error"; key: string; code: string; message: string }
  /** Passing: waiting for another conversation or a restarting model; always last, gone with the next event. */
  | { kind: "status"; key: string; code: AssistantStatusCode };

/** An image attached to a question. */
export type ChatImage = { id: string; url: string };

let sequence = 0;
const localKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;

/** The stored messages as chat items. */
export function itemsFromMessages(messages: AssistantMessage[]): ChatItem[] {
  return messages.flatMap((message): ChatItem[] => {
    if (message.role === "user") {
      const images = message.images?.map((id) => ({ id, url: assistantImageUrl(id) }));
      return [{ kind: "user", key: message.id, text: message.content, ...(images?.length && { images }), ...(message.screen && { screen: message.screen }) }];
    }
    if (message.role === "assistant") return message.content.trim() ? [{ kind: "assistant", key: message.id, text: message.content, streaming: false }] : [];
    const tool = message.tool;
    if (!tool) return [];
    if (tool.status === "pending") {
      return [
        {
          kind: "confirm",
          key: message.id,
          messageId: message.id,
          name: tool.name,
          summary: tool.summary ?? tool.name,
          permission: tool.permission ?? "write",
          allowRemember: tool.allowRemember,
          preview: tool.preview ?? null,
          options: tool.options ?? null,
          submitting: null,
        },
      ];
    }
    return [{ kind: "tool", key: message.id, toolCallId: null, messageId: message.id, name: tool.name, status: tool.status, label: tool.summary ?? tool.name, error: tool.error }];
  });
}

/** Adds the question the person just sent (before the server confirms it). */
export const addQuestion = (items: ChatItem[], text: string, images: ChatImage[] = [], screen?: ScreenContext | null): ChatItem[] => [
  ...items,
  { kind: "user", key: localKey("question"), text, ...(images.length && { images }), ...(screen && { screen }) },
];

const withoutStatus = (items: ChatItem[]) => (items.some((item) => item.kind === "status") ? items.filter((item) => item.kind !== "status") : items);

/** Applies one stream event. Any event ends a passing status. */
export function applyEvent(current: ChatItem[], event: AssistantStreamEvent): ChatItem[] {
  const items = withoutStatus(current);
  switch (event.type) {
    case "status":
      return event.code ? [...items, { kind: "status", key: "status", code: event.code }] : items;
    case "text": {
      const last = items[items.length - 1];
      if (last?.kind === "assistant" && last.streaming) return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: "assistant", key: localKey("answer"), text: event.text, streaming: true }];
    }
    case "message": {
      const index = items.findLastIndex((item) => item.kind === "assistant" && item.streaming);
      if (index < 0) return items;
      const item = items[index] as Extract<ChatItem, { kind: "assistant" }>;
      // An answer that only called tools has no text: drop the empty bubble.
      if (!item.text.trim()) return items.filter((_, position) => position !== index);
      return items.map((candidate, position) => (position === index ? { ...item, key: event.messageId, streaming: false } : candidate));
    }
    case "tool": {
      const matches = (item: ChatItem) =>
        (item.kind === "tool" && ((event.toolCallId && item.toolCallId === event.toolCallId) || (event.messageId && item.messageId === event.messageId))) ||
        (item.kind === "confirm" && event.messageId !== null && item.messageId === event.messageId);
      const next: ChatItem = {
        kind: "tool",
        key: event.messageId ?? `tool-${event.toolCallId}`,
        toolCallId: event.toolCallId || null,
        messageId: event.messageId,
        name: event.name,
        status: event.status,
        label: event.label,
        error: null,
      };
      const index = items.findIndex(matches);
      if (index < 0) return [...items, next];
      const existing = items[index] as ChatItem;
      return items.map((item, position) => (position === index ? { ...next, key: existing.key, messageId: event.messageId ?? next.messageId } : item));
    }
    case "confirm":
      if (items.some((item) => item.kind === "confirm" && item.messageId === event.messageId)) return items;
      return [
        ...items,
        {
          kind: "confirm",
          key: event.messageId,
          messageId: event.messageId,
          name: event.name,
          summary: event.summary,
          permission: event.permission,
          allowRemember: event.allowRemember,
          preview: event.preview ?? null,
          options: event.options ?? null,
          submitting: null,
        },
      ];
    case "notice":
      return [...items, { kind: "notice", key: localKey("notice"), code: event.code }];
    case "error":
      return [...finishStreaming(items), { kind: "error", key: localKey("error"), code: event.code, message: event.message }];
    case "done":
      return finishStreaming(items);
    case "start": {
      // The question's chip shows the screen as the server found it (gone when it was ignored).
      const index = items.findLastIndex((item) => item.kind === "user");
      const question = items[index];
      if (!event.question || question?.kind !== "user" || question.screen === event.question.screen) return items;
      const screen = event.question.screen;
      return items.with(index, { kind: "user", key: question.key, text: question.text, ...(question.images && { images: question.images }), ...(screen && { screen }) });
    }
  }
}

/** Ends a streaming answer (stopped, failed or done). */
export function finishStreaming(items: ChatItem[]): ChatItem[] {
  return withoutStatus(items).flatMap((item) => (item.kind === "assistant" && item.streaming ? (item.text.trim() ? [{ ...item, streaming: false }] : []) : [item]));
}

/** Marks a confirmation card as being sent (or back to waiting on failure). */
export const markConfirmation = (items: ChatItem[], messageId: string, submitting: "confirm" | "cancel" | null): ChatItem[] =>
  items.map((item) => (item.kind === "confirm" && item.messageId === messageId ? { ...item, submitting } : item));

/** The last answer's text, for reading it aloud. */
export function lastAnswer(items: ChatItem[]): string | null {
  const item = items.findLast((candidate) => candidate.kind === "assistant");
  return item?.kind === "assistant" ? item.text : null;
}
