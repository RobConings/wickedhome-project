/**
 * Playing server speech in the browser. Phones only let a page play sound it started from a tap; an audio
 * element that played once inside a tap may play again later (when the answer arrives). So the read-aloud
 * switch, push-to-talk and Send call `unlockAudio`, and the same element plays every chunk afterwards.
 */

/** 10 ms of silence. */
export const SILENT_WAV =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

let synthesisUnlocked = false;

/**
 * Call inside a tap. Plays silence on `audio` (when it is idle) so it may play later, and once per page an
 * empty utterance so the browser's voice may speak later too (iOS).
 */
export function unlockAudio(audio: HTMLAudioElement | null) {
  if (audio && (audio.paused || audio.ended)) {
    audio.src = SILENT_WAV;
    void audio.play().catch(() => undefined);
  }
  if (!synthesisUnlocked && typeof window !== "undefined" && "speechSynthesis" in window && !window.speechSynthesis.speaking) {
    synthesisUnlocked = true;
    try {
      const utterance = new SpeechSynthesisUtterance("");
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Nothing to unlock here.
    }
  }
}

/**
 * Plays `src` on `audio` until it ends. Rejects when it can't play (blocked, broken file); resolves early when
 * `signal` aborts (the audio is stopped then). `onPlaying` when the sound starts.
 */
export function playAudio(audio: HTMLAudioElement, src: string, signal: AbortSignal, onPlaying?: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return resolve();
    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("audio_error"));
    };
    const onAbort = () => {
      cleanup();
      audio.pause();
      resolve();
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort);
    audio.src = src;
    audio.play().then(onPlaying, (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error("audio_blocked"));
    });
  });
}
