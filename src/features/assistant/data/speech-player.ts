/**
 * Reading one answer aloud, chunk by chunk, while more chunks may still arrive (the answer is streaming in).
 * Pure apart from its dependencies (server speech, audio playback, the browser's voice), so it runs in tests
 * with fakes; `use-speech-output.ts` wires it to the page's audio element and `speechSynthesis`.
 *
 * Server voice: chunk 1 is requested as soon as it is there, the next ones one request at a time, at most
 * `prefetch` ahead of the chunk playing (one request at a time keeps a CPU speech server on the chunk that is
 * needed first). When the server voice fails, the rest of the answer goes to the browser's voice.
 */

export type SpeechPlayerDeps = {
  /** One chunk of server speech, as a playable URL. Null: only the browser's voice. */
  synthesize: ((text: string, signal: AbortSignal) => Promise<string>) | null;
  /** Plays `url` to its end; `onPlaying` when the sound starts. Rejects when it can't play; resolves early on abort. */
  play: (url: string, signal: AbortSignal, onPlaying: () => void) => Promise<void>;
  /** Frees a URL from `synthesize`. */
  release: (url: string) => void;
  /** The browser's voice: queues one utterance, resolves when it ended or failed. Null: none on this device. */
  speakBrowser: ((text: string, onStart: () => void) => Promise<void>) | null;
  /** True when the first chunk is queued, false when everything was read (not after `cancel`). */
  onSpeaking?: (speaking: boolean) => void;
  /** The first sound of this answer started playing. */
  onFirstAudio?: () => void;
};

export type SpeechPlayer = {
  /** More chunks of the answer, in order. */
  add: (chunks: string[]) => void;
  /** No more chunks will come: finish reading what is queued. */
  end: () => void;
  /** Stop now: pending requests are aborted, nothing more is played. */
  cancel: () => void;
  /** Settles when everything was read, or right after `cancel`. */
  done: Promise<void>;
};

type Slot = { promise: Promise<string>; resolve: (url: string) => void; reject: (error: unknown) => void };

function slot(): Slot {
  let resolve!: (url: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

export function createSpeechPlayer(deps: SpeechPlayerDeps, { prefetch = 2 }: { prefetch?: number } = {}): SpeechPlayer {
  const controller = new AbortController();
  const { signal } = controller;
  const chunks: string[] = [];
  let ended = false;
  let playing = 0;
  let started = false;
  let heard = false;
  const slots: Slot[] = [];
  const slotAt = (index: number) => (slots[index] ??= slot());
  const created = new Set<string>();

  // Wakes both loops when a chunk arrives, the answer ends, playback moves on or everything stops.
  let waiters: (() => void)[] = [];
  const changed = () => {
    const woken = waiters;
    waiters = [];
    woken.forEach((wake) => wake());
  };
  const nextChange = () => new Promise<void>((resolve) => waiters.push(resolve));
  signal.addEventListener("abort", changed);
  const aborted = new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

  const onPlaying = () => {
    if (heard || signal.aborted) return;
    heard = true;
    deps.onFirstAudio?.();
  };

  const synthesize = deps.synthesize;
  if (synthesize) {
    void (async () => {
      for (let index = 0; ; index += 1) {
        while (!signal.aborted && !(index < chunks.length && index <= playing + prefetch) && !(ended && index >= chunks.length)) await nextChange();
        if (signal.aborted || index >= chunks.length) return;
        try {
          const url = await synthesize(chunks[index]!, signal);
          if (signal.aborted) {
            deps.release(url);
            return;
          }
          created.add(url);
          slotAt(index).resolve(url);
        } catch (error) {
          slotAt(index).reject(error);
          return;
        }
      }
    })();
  }

  const done = (async () => {
    // From this chunk on the browser's voice reads (no server voice, or it failed).
    let browserFrom = synthesize ? Number.POSITIVE_INFINITY : 0;
    const utterances: Promise<void>[] = [];
    try {
      for (let index = 0; ; index += 1) {
        while (!signal.aborted && index >= chunks.length && !ended) await nextChange();
        if (signal.aborted || index >= chunks.length) break;
        playing = index;
        changed();
        if (index < browserFrom) {
          try {
            const url = await Promise.race([slotAt(index).promise, aborted.then(() => null)]);
            if (signal.aborted || url === null) break;
            await deps.play(url, signal, onPlaying);
            created.delete(url);
            deps.release(url);
            if (signal.aborted) break;
            continue;
          } catch {
            if (signal.aborted) break;
            browserFrom = index;
          }
        }
        if (!deps.speakBrowser) break;
        // Queued straight away: the browser reads its queue without gaps.
        utterances.push(deps.speakBrowser(chunks[index]!, onPlaying));
      }
      await Promise.race([Promise.all(utterances), aborted]);
    } finally {
      created.forEach((url) => deps.release(url));
      created.clear();
      if (!signal.aborted) {
        controller.abort();
        if (started) deps.onSpeaking?.(false);
      }
    }
  })();

  return {
    add(more) {
      if (signal.aborted || ended) return;
      const fresh = more.filter((chunk) => chunk.trim());
      if (fresh.length === 0) return;
      chunks.push(...fresh);
      if (!started) {
        started = true;
        deps.onSpeaking?.(true);
      }
      changed();
    },
    end() {
      if (ended) return;
      ended = true;
      changed();
    },
    cancel() {
      if (!signal.aborted) controller.abort();
    },
    done,
  };
}
