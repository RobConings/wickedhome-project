import type { AssistantStreamEvent } from "../types/assistant";
import type { SpeechChunker } from "./speech-text";

/**
 * Reading an answer aloud while it streams in: the stream's text goes through a `SpeechChunker`, complete
 * chunks go to a player at once. Only text the chat shows reaches here: the assistant loop holds a step's
 * text back on the server while a follow-up may still replace it (ai/core/assistant-loop.ts), and an answer
 * it drops is never sent. Text before a tool call or a confirmation card is not the answer (not read, as
 * before streaming): when one arrives, what was queued is stopped and reading starts over with the text after it.
 */

/** One answer's speech, driven by the chat (`use-assistant-chat.ts`). */
export type AnswerSpeech = {
  /** A streamed piece of the answer's text. */
  text: (piece: string) => void;
  /** A tool call or confirmation came: the text so far was not the answer; start over. */
  restart: () => void;
  /** The answer is complete: read the rest. */
  finish: () => void;
  /** Stopped, or replaced by a new question: silence. */
  cancel: () => void;
};

/** One run of the page's player (`use-speech-output.ts`): stopped from outside (Stop, push-to-talk, another answer) it is no longer `active`. */
export type SpeechSession = {
  add: (chunks: string[]) => void;
  end: () => void;
  cancel: () => void;
  active: () => boolean;
};

/**
 * `open` stops whatever is being read and starts a new session; `chunker` makes a fresh chunker. Once the
 * session was stopped from outside, the rest of this answer stays silent.
 */
export function createAnswerSpeech(open: () => SpeechSession, chunker: () => SpeechChunker, hooks: { onText?: () => void; onChunk?: (chunk: string) => void } = {}): AnswerSpeech {
  let session = open();
  let chunks = chunker();
  let heard = false;
  const add = (more: string[]) => {
    if (more.length === 0) return;
    more.forEach((chunk) => hooks.onChunk?.(chunk));
    session.add(more);
  };
  return {
    text(piece) {
      if (!piece || !session.active()) return;
      heard = true;
      hooks.onText?.();
      add(chunks.push(piece));
    },
    restart() {
      if (!heard || !session.active()) return;
      session.cancel();
      session = open();
      chunks = chunker();
      heard = false;
    },
    finish() {
      if (!session.active()) return;
      add(chunks.end());
      session.end();
    },
    cancel() {
      session.cancel();
    },
  };
}

/** Routes the chat's stream events to an answer's speech (none when the answer isn't read aloud). */
export function followAnswer(speech: AnswerSpeech | null) {
  return {
    event(event: AssistantStreamEvent) {
      if (!speech) return;
      if (event.type === "text") speech.text(event.text);
      else if (event.type === "tool" || event.type === "confirm") speech.restart();
    },
    /** The stream ended: read the rest, or nothing more when it was stopped. */
    settle(stopped: boolean) {
      if (!speech) return;
      if (stopped) speech.cancel();
      else speech.finish();
    },
  };
}
