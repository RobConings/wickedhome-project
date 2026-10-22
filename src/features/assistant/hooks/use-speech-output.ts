import * as React from "react";
import { ApiRequestError } from "@/lib/api-client";
import { todayIn } from "@/types/dates";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import { createAnswerSpeech, type AnswerSpeech, type SpeechSession } from "../data/answer-speech";
import { playAudio, unlockAudio } from "../data/speech-audio";
import { createSpeechPlayer, type SpeechPlayer } from "../data/speech-player";
import { SpeechChunker } from "../data/speech-text";
import { readVoicePreference, writeVoicePreference } from "../data/voice-preferences";

const STORAGE_KEY = "wh-assistant-read-aloud";
/** Set to "1" in this device's localStorage to log when the first audio of an answer plays (console.debug). */
const TIMING_KEY = "wh-speech-timing";
/** Chunks made ahead of the one playing. */
const PREFETCH = 2;

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function timingEnabled(): boolean {
  try {
    return localStorage.getItem(TIMING_KEY) === "1";
  } catch {
    return false;
  }
}

// ── One player per page ───────────────────────────────────────────────────────────────────────────────
// A new conversation remounts the chat right as its first answer is read out, so the playback lives here,
// not in the component: the remounted chat can still show "Stop" and stop it.

let audioElement: HTMLAudioElement | null = null;
let currentRun = 0;
let currentPlayer: SpeechPlayer | null = null;
let speakingNow = false;
const listeners = new Set<() => void>();

function setSpeakingNow(value: boolean) {
  if (speakingNow === value) return;
  speakingNow = value;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const hasSynthesis = () => typeof window !== "undefined" && "speechSynthesis" in window;
const hasAudio = () => typeof window !== "undefined" && typeof window.Audio !== "undefined";

function audio(): HTMLAudioElement | null {
  if (!audioElement && hasAudio()) {
    audioElement = new Audio();
    audioElement.preload = "auto";
  }
  return audioElement;
}

/** Stops whatever is being read and starts a new run (its number). */
function stopAll(): number {
  currentRun += 1;
  currentPlayer?.cancel();
  currentPlayer = null;
  if (audioElement && !audioElement.paused) audioElement.pause();
  if (hasSynthesis()) window.speechSynthesis.cancel();
  return currentRun;
}

/** Utterances being spoken: kept referenced, or some browsers drop them (and their end event) early. */
const utterances = new Set<SpeechSynthesisUtterance>();

/** The browser's own voice, one utterance per chunk (long single utterances get cut off in some browsers). */
function browserVoice(locale: "en" | "nl") {
  if (!hasSynthesis()) return null;
  return (text: string, onStart: () => void) =>
    new Promise<void>((resolve) => {
      const synthesis = window.speechSynthesis;
      const voice = synthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith(locale));
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale === "nl" ? "nl-BE" : "en-GB";
      if (voice) utterance.voice = voice;
      const finish = () => {
        utterances.delete(utterance);
        resolve();
      };
      utterance.onstart = onStart;
      utterance.onend = finish;
      utterance.onerror = finish;
      utterances.add(utterance);
      synthesis.speak(utterance);
    });
}

/** The server voice for one chunk, as an object URL; a voice picked on this device that the server lost is forgotten. */
function serverVoice(locale: "en" | "nl", client: Pick<AssistantClient, "speech">) {
  let voice = readVoicePreference(locale);
  const fetchChunk = async (text: string, signal: AbortSignal): Promise<string> => {
    try {
      const blob = await client.speech({ text, locale, ...(voice ? { voice } : {}) }, signal);
      return URL.createObjectURL(blob);
    } catch (error) {
      if (voice && error instanceof ApiRequestError && error.code === "invalid_voice") {
        writeVoicePreference(locale, null);
        voice = null;
        return fetchChunk(text, signal);
      }
      throw error;
    }
  };
  return fetchChunk;
}

/** Development timing (`wh-speech-timing`): question sent → first text → first chunk → first audio playing. */
function timing() {
  if (!timingEnabled() || typeof performance === "undefined") return null;
  const start = performance.now();
  const marks: { text?: number; chunk?: number; chunkLength?: number; audio?: number } = {};
  const since = () => Math.round(performance.now() - start);
  return {
    text: () => (marks.text ??= since()),
    chunk: (chunk: string) => {
      if (marks.chunk !== undefined) return;
      marks.chunk = since();
      marks.chunkLength = chunk.length;
    },
    audio: () => {
      if (marks.audio !== undefined) return;
      marks.audio = since();
      console.debug(`[speech] first audio after ${marks.audio} ms (first text ${marks.text ?? "-"} ms, first chunk ${marks.chunk ?? "-"} ms, ${marks.chunkLength ?? 0} chars)`);
    },
  };
}

/** Stops what is being read and starts one answer's playback (server voice when `server`, else the browser's). */
function openSession(locale: "en" | "nl", server: boolean, client: Pick<AssistantClient, "speech">, onFirstAudio?: () => void): SpeechSession {
  const run = stopAll();
  const element = server ? audio() : null;
  const player = createSpeechPlayer(
    {
      synthesize: element ? serverVoice(locale, client) : null,
      play: (url, signal, onPlaying) => playAudio(element!, url, signal, onPlaying),
      release: (url) => URL.revokeObjectURL(url),
      speakBrowser: browserVoice(locale),
      onSpeaking: (value) => run === currentRun && setSpeakingNow(value),
      onFirstAudio,
    },
    { prefetch: PREFETCH },
  );
  currentPlayer = player;
  return {
    add: (chunks) => run === currentRun && player.add(chunks),
    end: () => run === currentRun && player.end(),
    cancel: () => {
      if (run !== currentRun) return;
      stopAll();
      setSpeakingNow(false);
    },
    active: () => run === currentRun,
  };
}

/**
 * Optional read-aloud of answers. With server speech (`ASSISTANT_TTS_URL`, e.g. Piper on the home server) the
 * answer is spoken sentence by sentence in a natural voice, picked per device in the assistant's settings; the
 * browser's `speechSynthesis` is the fallback (and the only voice without server speech). The setting is
 * remembered per device. Call `unlock` from a tap (read-aloud switch, push-to-talk, Send) so phones allow the
 * playback that starts later, when the answer arrives.
 *
 * `begin` starts reading an answer that is still streaming in (`AnswerSpeech`): the first sentence plays while
 * the rest is being written.
 */
export function useSpeechOutput(locale: "en" | "nl", { client = assistantClient, server = false }: { client?: Pick<AssistantClient, "speech">; server?: boolean } = {}) {
  const useServer = server && hasAudio();
  const supported = useServer || hasSynthesis();
  const [enabled, setEnabledState] = React.useState(() => supported && readSetting());
  const speaking = React.useSyncExternalStore(subscribe, () => speakingNow, () => false);
  const clientRef = React.useRef(client);
  React.useLayoutEffect(() => {
    clientRef.current = client;
  });

  const unlock = React.useCallback(() => {
    unlockAudio(useServer ? audio() : null);
  }, [useServer]);

  const cancel = React.useCallback(() => {
    stopAll();
    setSpeakingNow(false);
  }, []);

  const setEnabled = React.useCallback(
    (value: boolean) => {
      setEnabledState(value);
      try {
        localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
      } catch {
        // Not remembered on this device.
      }
      if (value) unlock();
      else cancel();
    },
    [cancel, unlock],
  );

  /** Starts reading an answer as it streams in; null when read-aloud is off. Stops what was being read. */
  const begin = React.useCallback((): AnswerSpeech | null => {
    if (!supported || !enabled) return null;
    const timer = timing();
    const today = todayIn();
    return createAnswerSpeech(
      () => openSession(locale, useServer, clientRef.current, timer?.audio),
      () => new SpeechChunker({ locale, today }),
      timer ? { onText: timer.text, onChunk: timer.chunk } : {},
    );
  }, [enabled, locale, supported, useServer]);

  /** Reads a complete text aloud. */
  const speak = React.useCallback(
    (text: string) => {
      const speech = begin();
      speech?.text(text);
      speech?.finish();
    },
    [begin],
  );

  // No cancel on unmount: a new conversation moves to its own URL (remounting the chat) right as its first
  // spoken answer starts being read out.
  return { supported, server: useServer, enabled, setEnabled, begin, speak, speaking, cancel, unlock };
}
