/**
 * Reading an answer aloud while it streams in: the chat's stream events through the real chunker to the
 * player. Only the text the chat shows (the stream's `text` events: the server holds back text a follow-up may
 * still replace) is read; text before a tool call or confirmation is not the answer: reading stops and starts
 * over. No database or browser needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/features/assistant/data/answer-speech.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantStreamEvent } from "../types/assistant";
import { createAnswerSpeech, followAnswer, type SpeechSession } from "./answer-speech";
import { createSpeechPlayer } from "./speech-player";
import { SpeechChunker } from "./speech-text";

const chunker = () => new SpeechChunker({ locale: "nl", today: "2026-10-04" });

async function flush() {
  for (let round = 0; round < 10; round += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Sessions as the page's player hands them out: opening one stops the one before. */
function fakeSessions() {
  type Fake = SpeechSession & { added: string[]; ended: boolean; cancelled: boolean };
  const sessions: Fake[] = [];
  const open = (): SpeechSession => {
    const previous = sessions.at(-1);
    if (previous) previous.cancelled = true;
    const session: Fake = {
      added: [],
      ended: false,
      cancelled: false,
      add: (chunks) => void session.added.push(...chunks),
      end: () => void (session.ended = true),
      cancel: () => void (session.cancelled = true),
      active: () => !session.cancelled,
    };
    sessions.push(session);
    return session;
  };
  return { sessions, open };
}

const text = (value: string): AssistantStreamEvent => ({ type: "text", text: value });
const tool: AssistantStreamEvent = { type: "tool", messageId: "m1", toolCallId: "t1", name: "list_events", status: "running", label: "Agenda bekijken" };
const confirm: AssistantStreamEvent = {
  type: "confirm",
  messageId: "m1",
  toolCallId: "t2",
  name: "add_event",
  summary: "Tandarts toevoegen",
  permission: "write",
  allowRemember: false,
};

describe("answer speech", () => {
  it("hands each chunk to the player as soon as it is complete, the rest at the end", () => {
    const { sessions, open } = fakeSessions();
    const chunks: string[] = [];
    const speech = followAnswer(createAnswerSpeech(open, chunker, { onChunk: (chunk) => chunks.push(chunk) }));
    speech.event({ type: "start", conversationId: "c1", userMessageId: "u1", title: null });
    speech.event(text("Morgen om 10:00 komt de tandarts"));
    speech.event(text(" langs bij jullie thuis. "));
    assert.deepEqual(sessions[0]!.added, [], "the sentence might still go on");
    speech.event(text("Daarna heb je "));
    assert.deepEqual(sessions[0]!.added, ["Morgen om tien uur komt de tandarts langs bij jullie thuis."], "read while the rest streams in");
    speech.event(text("niets meer gepland."));
    speech.event({ type: "message", messageId: "m1", role: "assistant" });
    speech.event({ type: "done", status: "done" });
    assert.equal(sessions[0]!.ended, false);
    speech.settle(false);
    assert.deepEqual(sessions[0]!.added, ["Morgen om tien uur komt de tandarts langs bij jullie thuis.", "Daarna heb je niets meer gepland."]);
    assert.equal(sessions[0]!.ended, true);
    assert.deepEqual(chunks, sessions[0]!.added);
    assert.equal(sessions.length, 1);
  });

  it("only the stream's text is read: notices, errors and tool labels are not", () => {
    const { sessions, open } = fakeSessions();
    const speech = followAnswer(createAnswerSpeech(open, chunker));
    speech.event({ type: "notice", code: "max_steps" });
    speech.event(tool);
    speech.event({ type: "error", code: "interrupted", message: "Verbinding verbroken." });
    speech.settle(false);
    assert.equal(sessions.length, 1, "a tool call before any text starts nothing over");
    assert.deepEqual(sessions[0]!.added, []);
  });

  it("text before a tool call is replaced: what was queued stops, reading starts over with the new text", () => {
    const { sessions, open } = fakeSessions();
    const speech = followAnswer(createAnswerSpeech(open, chunker));
    speech.event(text("Ik kijk even in je agenda, momentje alsjeblieft. "));
    speech.event(text("Eerst "));
    assert.equal(sessions[0]!.added.length, 1);
    speech.event(tool);
    assert.equal(sessions[0]!.cancelled, true, "the replaced text stops at once");
    assert.equal(sessions.length, 2);
    speech.event(text("Morgen komt de tandarts."));
    speech.settle(false);
    assert.deepEqual(sessions[1]!.added, ["Morgen komt de tandarts."], "nothing of the replaced text comes back");
    assert.equal(sessions[1]!.ended, true);
    assert.equal(sessions[0]!.ended, false);
  });

  it("a confirmation card replaces the text before it too", () => {
    const { sessions, open } = fakeSessions();
    const speech = followAnswer(createAnswerSpeech(open, chunker));
    speech.event(text("Ik zet de tandarts in je agenda."));
    speech.event(confirm);
    speech.event(confirm);
    assert.equal(sessions.length, 2, "one restart: no new text came in between");
    speech.settle(false);
    assert.deepEqual(sessions[0]!.added, []);
    assert.deepEqual(sessions[1]!.added, []);
  });

  it("stopped (Stop, a new question): silence, nothing more is read", () => {
    const { sessions, open } = fakeSessions();
    const speech = followAnswer(createAnswerSpeech(open, chunker));
    speech.event(text("Morgen om 10:00 komt de tandarts langs bij jullie thuis. Daarna"));
    speech.settle(true);
    assert.equal(sessions[0]!.cancelled, true);
    assert.equal(sessions[0]!.ended, false);
    assert.equal(sessions[0]!.added.length, 1);
  });

  it("once stopped from outside, the rest of the answer stays silent", () => {
    const { sessions, open } = fakeSessions();
    const speech = followAnswer(createAnswerSpeech(open, chunker));
    speech.event(text("Morgen om 10:00 komt de tandarts langs bij jullie thuis. Daarna"));
    sessions[0]!.cancelled = true; // push-to-talk, the Stop button, another answer
    speech.event(text(" heb je niets meer gepland. En overmorgen ook niet."));
    speech.event(tool);
    speech.event(text("Nog meer tekst."));
    speech.settle(false);
    assert.equal(sessions.length, 1, "no new session opened");
    assert.equal(sessions[0]!.added.length, 1);
    assert.equal(sessions[0]!.ended, false);
  });

  it("does nothing when the answer isn't read aloud", () => {
    const speech = followAnswer(null);
    speech.event(text("Hallo."));
    speech.event(tool);
    speech.settle(false);
    speech.settle(true);
  });
});

describe("answer speech with the player", () => {
  it("requests speech only for the final answer's text, the first chunk while it streams in", async () => {
    const requested: string[] = [];
    const signals: AbortSignal[] = [];
    const played: string[] = [];
    let current: ReturnType<typeof createSpeechPlayer> | null = null;
    let run = 0;
    const open = (): SpeechSession => {
      current?.cancel();
      const mine = ++run;
      const player = createSpeechPlayer({
        synthesize: (chunk, signal) => {
          requested.push(chunk);
          signals.push(signal);
          // The speech server answers only for the final answer; the replaced text's request stays pending.
          return chunk.startsWith("Ik kijk") ? new Promise<string>(() => undefined) : Promise.resolve(`blob:${chunk}`);
        },
        play: async (url) => void played.push(url),
        release: () => undefined,
        speakBrowser: null,
      });
      current = player;
      return { add: player.add, end: player.end, cancel: player.cancel, active: () => mine === run };
    };
    const speech = followAnswer(createAnswerSpeech(open, chunker));

    speech.event(text("Ik kijk even in je agenda, momentje alsjeblieft. Eerst"));
    await flush();
    assert.deepEqual(requested, ["Ik kijk even in je agenda,"], "the first chunk: up to a comma, so the voice starts quickly");
    speech.event(tool);
    await flush();
    assert.equal(signals[0]!.aborted, true, "the replaced text's request is aborted");

    speech.event(text("Morgen om 10:00 komt de tandarts langs bij jullie thuis. "));
    speech.event(text("Daarna "));
    await flush();
    assert.deepEqual(requested.slice(1), ["Morgen om tien uur komt de tandarts langs bij jullie thuis."], "before the answer is complete");
    speech.event(text("heb je niets meer gepland."));
    speech.settle(false);
    await current!.done;
    assert.deepEqual(played, ["blob:Morgen om tien uur komt de tandarts langs bij jullie thuis.", "blob:Daarna heb je niets meer gepland."]);
  });
});
