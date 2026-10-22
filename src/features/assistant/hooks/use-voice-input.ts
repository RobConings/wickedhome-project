import * as React from "react";
import type { AssistantClient } from "../data/assistant-client";

/**
 * Push-to-talk. With server speech-to-text configured (`ASSISTANT_STT_URL`, a local Whisper) the recording
 * goes to our own server, so audio stays in the house. Otherwise the browser's built-in recognition is used
 * where it exists (Chrome and Safari; note that Chrome sends the audio to Google for that). Both need HTTPS
 * (or localhost) for the microphone.
 *
 * Voice only fills in the question: it never confirms anything; confirmation cards still need a tap.
 */
export type VoiceState = "idle" | "listening" | "transcribing" | "error";
export type VoiceMode = "server" | "browser" | "none";
export type VoiceError = "denied" | "no_speech" | "failed";

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const canRecord = () =>
  typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

/** Which way voice input works on this device. */
export function voiceModeFor(serverStt: boolean): VoiceMode {
  if (serverStt && canRecord()) return "server";
  if (recognitionConstructor()) return "browser";
  return "none";
}

/** Longest recording, so a stuck button doesn't record forever. */
const MAX_RECORDING_MS = 60_000;

export function useVoiceInput({
  client,
  serverStt,
  locale,
  onResult,
}: {
  client: AssistantClient;
  serverStt: boolean;
  locale: "en" | "nl";
  /** The recognised text (sent as a spoken question). */
  onResult: (text: string) => void;
}) {
  const [mode] = React.useState<VoiceMode>(() => voiceModeFor(serverStt));
  const [state, setState] = React.useState<VoiceState>("idle");
  const [error, setError] = React.useState<VoiceError | null>(null);
  const [interim, setInterim] = React.useState("");
  const recorder = React.useRef<MediaRecorder | null>(null);
  const recognition = React.useRef<Recognition | null>(null);
  const timer = React.useRef<number | null>(null);
  const onResultRef = React.useRef(onResult);
  React.useLayoutEffect(() => {
    onResultRef.current = onResult;
  });

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const fail = React.useCallback((reason: VoiceError) => {
    clearTimer();
    setError(reason);
    setState("error");
    setInterim("");
  }, []);

  const stop = React.useCallback(() => {
    clearTimer();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recognition.current?.stop();
  }, []);

  const start = React.useCallback(async () => {
    if (state === "listening" || state === "transcribing") return;
    setError(null);
    setInterim("");
    if (mode === "server") {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        fail("denied");
        return;
      }
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      recorder.current = media;
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        const audio = new Blob(chunks, { type: media.mimeType || "audio/webm" });
        if (audio.size < 1000) {
          fail("no_speech");
          return;
        }
        setState("transcribing");
        client
          .transcribe(audio, locale)
          .then((text) => {
            setState("idle");
            if (text.trim()) onResultRef.current(text.trim());
            else fail("no_speech");
          })
          .catch(() => fail("failed"));
      };
      media.start();
      setState("listening");
      timer.current = window.setTimeout(stop, MAX_RECORDING_MS);
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const recognizer = new Constructor();
    recognition.current = recognizer;
    recognizer.lang = locale === "nl" ? "nl-BE" : "en-GB";
    recognizer.interimResults = true;
    recognizer.continuous = false;
    recognizer.maxAlternatives = 1;
    let finalText = "";
    let failed = false;
    recognizer.onresult = (event) => {
      let text = "";
      finalText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        text += transcript;
        if (result?.isFinal) finalText += transcript;
      }
      setInterim(text);
    };
    recognizer.onerror = (event) => {
      failed = true;
      fail(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : event.error === "no-speech" ? "no_speech" : "failed");
    };
    recognizer.onend = () => {
      clearTimer();
      recognition.current = null;
      if (failed) return;
      setInterim("");
      setState("idle");
      if (finalText.trim()) onResultRef.current(finalText.trim());
      else fail("no_speech");
    };
    try {
      recognizer.start();
      setState("listening");
      timer.current = window.setTimeout(stop, MAX_RECORDING_MS);
    } catch {
      fail("failed");
    }
  }, [client, fail, locale, mode, state, stop]);

  /** Stops without using what was said. */
  const cancel = React.useCallback(() => {
    clearTimer();
    if (recorder.current) {
      recorder.current.onstop = null;
      if (recorder.current.state !== "inactive") recorder.current.stop();
      recorder.current.stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
    }
    if (recognition.current) {
      recognition.current.onend = null;
      recognition.current.onerror = null;
      recognition.current.abort();
      recognition.current = null;
    }
    setState("idle");
    setInterim("");
  }, []);

  React.useEffect(() => cancel, [cancel]);

  return { mode, supported: mode !== "none", state, error, interim, start, stop, cancel };
}
