import * as React from "react";
import { ApiRequestError } from "@/lib/api-client";
import { followAnswer, type AnswerSpeech } from "../data/answer-speech";
import type { AssistantClient } from "../data/assistant-client";
import { addQuestion, applyEvent, finishStreaming, itemsFromMessages, markConfirmation, type ChatImage, type ChatItem } from "../data/chat-state";
import { assistantImageUrl, type AssistantMessage, type AssistantStreamEvent } from "../types/assistant";
import type { ScreenContext } from "@/types/screen-context";

/** What the person changed or picked on a card (a tool's `confirmation`): sent with Confirm. */
export type ConfirmExtra = { edits?: Record<string, string>; choice?: string };

type Options = {
  client: AssistantClient;
  /** The open conversation, or null for a new one. */
  conversationId: string | null;
  initialMessages?: AssistantMessage[];
  /** The conversation is still answering (the page was left mid-answer): attach to it on open. */
  running?: boolean;
  /** A new conversation got its id (first event of its first answer). */
  onConversationCreated?: (id: string) => void;
  /** An answer finished (done, paused or failed): refresh lists. */
  onSettled?: () => void;
  /** The question was spoken: read its answer aloud while it streams in (`useSpeechOutput().begin`; null: read-aloud is off). */
  speakAnswer?: () => AnswerSpeech | null;
};

type Work = (onEvent: (event: AssistantStreamEvent) => void, signal: AbortSignal) => Promise<unknown>;

/** Attempts to attach again after the stream was cut off (each after a longer pause, only while visible). */
const REATTACH_ATTEMPTS = 3;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/** Resolves once the page is visible again (a phone back from the lock screen), or at once. */
const whenVisible = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (typeof document === "undefined" || document.visibilityState === "visible") return resolve();
    const done = () => {
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState === "visible") done();
    };
    document.addEventListener("visibilitychange", onChange);
    signal.addEventListener("abort", done, { once: true });
  });

/**
 * The chat's state and actions: send a question (typed or spoken), confirm or cancel a pending action, stop.
 * Streams the answer into `items` as it arrives.
 *
 * Answers run on the server whether or not this chat watches (ai/core/assistant-runs.ts): leaving the page
 * only stops watching, and Stop asks the server to stop. A stream that is cut off (network, a phone asleep)
 * attaches again and replays the answer from its start onto the items as they were when it began; a
 * conversation opened while it is still answering (`running`) attaches the same way.
 */
export function useAssistantChat({ client, conversationId, initialMessages = [], running = false, onConversationCreated, onSettled, speakAnswer }: Options) {
  const [items, setItems] = React.useState<ChatItem[]>(() => itemsFromMessages(initialMessages));
  const [busy, setBusy] = React.useState(false);
  const [currentId, setCurrentId] = React.useState(conversationId);
  const controller = React.useRef<AbortController | null>(null);
  const idRef = React.useRef(conversationId);
  const itemsRef = React.useRef(items);
  const callbacks = React.useRef({ onConversationCreated, onSettled, speakAnswer });
  React.useLayoutEffect(() => {
    callbacks.current = { onConversationCreated, onSettled, speakAnswer };
    itemsRef.current = items;
  });

  // Another conversation was opened: start over from its stored messages.
  const [loadedFor, setLoadedFor] = React.useState(conversationId);
  if (conversationId !== loadedFor) {
    setLoadedFor(conversationId);
    if (conversationId !== currentId) {
      setCurrentId(conversationId);
      setItems(itemsFromMessages(initialMessages));
    }
  }
  React.useLayoutEffect(() => {
    idRef.current = currentId;
  }, [currentId]);

  // Leaving only stops watching: the server finishes (and stores) the answer.
  React.useEffect(() => () => controller.current?.abort(), []);

  /**
   * Watches one answer: `work` streams it; when the stream is cut off, attach again (`base`: the items when
   * the answer began, the replay is applied onto them). `withQuestion`: the replayed `start` adds the question
   * (attaching to an answer this chat didn't start).
   */
  const run = React.useCallback(
    async (work: Work, options: { spoken?: boolean; base: ChatItem[]; withQuestion?: boolean }) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      // Read aloud as it streams in: the text after the last tool activity (the final answer). Stop, a new
      // question or leaving the conversation (abort) silences it.
      const speech = followAnswer(options.spoken ? (callbacks.current.speakAnswer?.() ?? null) : null);
      // The server always ends with `done` (or `error`); a stream that just stops was cut off.
      let ended = false;
      let received = false;
      let replaying = false;
      const onEvent = (event: AssistantStreamEvent) => {
        received = true;
        if (event.type === "done" || event.type === "error") ended = true;
        // A replay starts the answer over; reading it aloud again would repeat it.
        if (!replaying) speech.event(event);
        if (event.type === "start" && event.conversationId) {
          idRef.current = event.conversationId;
          setCurrentId((previous) => {
            if (previous !== event.conversationId) callbacks.current.onConversationCreated?.(event.conversationId);
            return event.conversationId;
          });
          const question = event.question;
          if (options.withQuestion && question) {
            setItems((previous) => addQuestion(previous, question.content, question.images.map((id) => ({ id, url: assistantImageUrl(id) })), question.screen));
          }
        }
        setItems((previous) => applyEvent(previous, event));
      };
      const fail = (code: string, message = "") => setItems((previous) => applyEvent(previous, { type: "error", code, message }));
      let attempts = 0;
      try {
        for (;;) {
          try {
            const attached = await work(onEvent, abort.signal);
            if (attached === false && idRef.current) {
              // Nothing runs any more (it ended in between): the stored messages are complete.
              const detail = await client.getConversation(idRef.current);
              if (!abort.signal.aborted) setItems(itemsFromMessages(detail.messages));
              ended = true;
            }
          } catch (error) {
            if (abort.signal.aborted) break;
            // Refused before streaming (its own code), or failed before anything arrived: no answer to go back to.
            if (error instanceof ApiRequestError || (!received && attempts === 0) || !idRef.current) {
              fail(error instanceof ApiRequestError ? error.code : received ? "interrupted" : "network", error instanceof ApiRequestError ? error.message : "");
              break;
            }
          }
          if (ended || abort.signal.aborted) break;
          // Cut off (network, phone asleep, server busy restarting): the answer goes on server-side; attach again.
          const id = idRef.current;
          if (!id || attempts >= REATTACH_ATTEMPTS) {
            fail("interrupted");
            break;
          }
          attempts += 1;
          await whenVisible(abort.signal);
          await pause(attempts * 1000, abort.signal);
          if (abort.signal.aborted) break;
          replaying = true;
          setItems(options.base);
          work = (handler, signal) => client.attach(id, handler, signal);
        }
      } finally {
        if (controller.current === abort) controller.current = null;
        setItems((previous) => finishStreaming(previous));
        setBusy(false);
        callbacks.current.onSettled?.();
        speech.settle(abort.signal.aborted);
      }
    },
    [client],
  );

  // Opened while it is still answering (the page was left mid-answer): watch the rest, from the start.
  const attachOnOpen = React.useRef(running && conversationId !== null);
  React.useEffect(() => {
    const id = idRef.current;
    if (!attachOnOpen.current || !id) return;
    attachOnOpen.current = false;
    void run((onEvent, signal) => client.attach(id, onEvent, signal), { base: itemsRef.current, withQuestion: true });
  }, [client, run]);

  const send = React.useCallback(
    /** `screen`: the page the question is about (screen context); only its kind and id are sent. */
    (text: string, options: { voice?: boolean; images?: ChatImage[]; screen?: ScreenContext | null } = {}) => {
      const content = text.trim();
      const images = options.images ?? [];
      if (!content && !images.length) return;
      const screen = options.screen ?? null;
      const base = addQuestion(itemsRef.current, content, images, screen);
      setItems(base);
      const imageIds = images.map((image) => image.id);
      const input = {
        content,
        voice: options.voice ?? false,
        ...(imageIds.length && { imageIds }),
        ...(screen && { screen: { kind: screen.kind, ...(screen.id && { id: screen.id }) } }),
      };
      void run((onEvent, signal) => client.send(currentId, input, onEvent, signal), {
        spoken: options.voice ?? false,
        base,
      });
    },
    [client, currentId, run],
  );

  const decide = React.useCallback(
    (messageId: string, decision: "confirm" | "cancel", remember = false, extra: ConfirmExtra = {}) => {
      if (!currentId) return;
      const base = markConfirmation(itemsRef.current, messageId, decision);
      setItems(base);
      void run(
        async (onEvent, signal) => {
          try {
            const amended = decision === "confirm" ? { ...(extra.edits && Object.keys(extra.edits).length ? { edits: extra.edits } : {}), ...(extra.choice ? { choice: extra.choice } : {}) } : {};
            await client.confirm(currentId, messageId, { decision, remember, ...amended }, onEvent, signal);
          } catch (error) {
            setItems((previous) => markConfirmation(previous, messageId, null));
            throw error;
          }
        },
        { base },
      );
    },
    [client, currentId, run],
  );

  /** Stops the answer on the server too (closing the connection alone no longer does). */
  const stop = React.useCallback(() => {
    const id = idRef.current;
    controller.current?.abort();
    if (id) void client.stop(id).catch(() => undefined);
  }, [client]);

  /** Asks the last question again (after an error). */
  const retry = React.useCallback(() => {
    const question = items.findLast((item) => item.kind === "user");
    if (question?.kind === "user") send(question.text, { images: question.images, screen: question.screen });
  }, [items, send]);

  return { items, busy, conversationId: currentId, send, decide, stop, retry };
}
