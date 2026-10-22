/**
 * The streaming read-aloud player: chunks of an answer that is still coming in, read with the server voice
 * (a fake speech endpoint behind a fake `fetch`) on a fake audio element, through the real `playAudio`; the
 * browser's voice is a recorder. No database or browser needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/features/assistant/data/speech-player.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playAudio } from "./speech-audio";
import { createSpeechPlayer, type SpeechPlayerDeps } from "./speech-player";

/** Lets every pending promise chain run. */
async function flush() {
  for (let round = 0; round < 10; round += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

// ── A fake speech endpoint behind a fake fetch ────────────────────────────────────────────────────────

type Request = { text: string; signal: AbortSignal; respond: () => void; fail: (status?: number) => void; settled: boolean };

function fakeSpeechServer() {
  const requests: Request[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch = (_url: string, init: { body: string; signal: AbortSignal }) =>
    new Promise<Response>((resolve, reject) => {
      const { text } = JSON.parse(init.body) as { text: string };
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const request: Request = {
        text,
        signal: init.signal,
        settled: false,
        respond: () => settle(() => resolve(new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "Content-Type": "audio/wav" } }))),
        fail: (status = 500) => settle(() => resolve(new Response(JSON.stringify({ error: { code: "failed" } }), { status }))),
      };
      function settle(action: () => void) {
        if (request.settled) return;
        request.settled = true;
        inFlight -= 1;
        action();
      }
      init.signal.addEventListener("abort", () => settle(() => reject(new DOMException("Aborted", "AbortError"))), { once: true });
      requests.push(request);
    });
  /** What `use-speech-output.ts` does with the client's `speech`: the audio as a URL. */
  const synthesize = async (text: string, signal: AbortSignal) => {
    const response = await fetch("/api/assistant/speech", { body: JSON.stringify({ text, locale: "nl" }), signal });
    if (!response.ok) throw new Error(`speech ${response.status}`);
    await response.blob();
    return `blob:${text}`;
  };
  return { requests, synthesize, texts: () => requests.map((request) => request.text), maxInFlight: () => maxInFlight };
}

// ── A fake audio element ──────────────────────────────────────────────────────────────────────────────

class FakeAudio extends EventTarget {
  src = "";
  paused = true;
  /** Every `src` that started playing. */
  played: string[] = [];
  pauses = 0;
  /** The next `play()` is refused (autoplay blocked). */
  block = false;
  play(): Promise<void> {
    if (this.block) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    this.played.push(this.src);
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.pauses += 1;
  }
  /** The current sound played to its end. */
  finish() {
    this.paused = true;
    this.dispatchEvent(new Event("ended"));
  }
  /** The current sound can't be decoded. */
  break() {
    this.paused = true;
    this.dispatchEvent(new Event("error"));
  }
}

function setup(options: { server?: boolean; browser?: boolean } = {}) {
  const server = fakeSpeechServer();
  const audio = new FakeAudio();
  const browser: string[] = [];
  const released: string[] = [];
  const speaking: boolean[] = [];
  let firstAudio = 0;
  const deps: SpeechPlayerDeps = {
    synthesize: options.server === false ? null : server.synthesize,
    play: (url, signal, onPlaying) => playAudio(audio as unknown as HTMLAudioElement, url, signal, onPlaying),
    release: (url) => released.push(url),
    speakBrowser:
      options.browser === false
        ? null
        : async (text, onStart) => {
            browser.push(text);
            onStart();
          },
    onSpeaking: (value) => speaking.push(value),
    onFirstAudio: () => (firstAudio += 1),
  };
  const player = createSpeechPlayer(deps, { prefetch: 2 });
  let settled = false;
  void player.done.then(() => (settled = true));
  return { player, server, audio, browser, released, speaking, firstAudio: () => firstAudio, settled: () => settled };
}

describe("speech player, server voice", () => {
  it("requests the first chunk as soon as it is there, before the answer is complete", async () => {
    const { player, server, audio, speaking } = setup();
    assert.deepEqual(server.texts(), []);
    player.add(["Goedemorgen."]);
    await flush();
    assert.deepEqual(server.texts(), ["Goedemorgen."]);
    assert.deepEqual(speaking, [true]);
    server.requests[0]!.respond();
    await flush();
    assert.deepEqual(audio.played, ["blob:Goedemorgen."], "it plays while the rest of the answer is still being written");
    player.cancel();
  });

  it("makes one request at a time, at most two chunks ahead of the one playing", async () => {
    const { player, server, audio } = setup();
    player.add(["Een.", "Twee.", "Drie.", "Vier.", "Vijf."]);
    player.end();
    // Answer every request right away: only the prefetch limit holds requests back.
    for (let round = 0; round < 5; round += 1) {
      await flush();
      server.requests.filter((request) => !request.settled).forEach((request) => request.respond());
    }
    await flush();
    assert.equal(server.maxInFlight(), 1);
    assert.deepEqual(audio.played, ["blob:Een."]);
    assert.deepEqual(server.texts(), ["Een.", "Twee.", "Drie."], "chunk 1 plays, chunks 2 and 3 are made ahead");

    audio.finish();
    await flush();
    server.requests.filter((request) => !request.settled).forEach((request) => request.respond());
    await flush();
    assert.deepEqual(audio.played, ["blob:Een.", "blob:Twee."]);
    assert.deepEqual(server.texts(), ["Een.", "Twee.", "Drie.", "Vier."]);
    player.cancel();
  });

  it("reads every chunk in order, frees each URL and reports speaking and the first sound once", async () => {
    const { player, server, audio, released, speaking, firstAudio, settled } = setup();
    player.add(["Een."]);
    await flush();
    server.requests[0]!.respond();
    await flush();
    assert.equal(firstAudio(), 1);
    // More text streams in while chunk 1 plays.
    player.add(["Twee.", "  "]);
    player.add(["Drie."]);
    await flush();
    for (let round = 0; round < 3; round += 1) {
      server.requests.filter((request) => !request.settled).forEach((request) => request.respond());
      await flush();
      audio.finish();
      await flush();
    }
    assert.equal(settled(), false, "not done before the answer is complete");
    player.end();
    await player.done;
    assert.deepEqual(audio.played, ["blob:Een.", "blob:Twee.", "blob:Drie."]);
    assert.deepEqual(server.texts(), ["Een.", "Twee.", "Drie."], "blank chunks are skipped");
    assert.deepEqual(released, ["blob:Een.", "blob:Twee.", "blob:Drie."]);
    assert.deepEqual(speaking, [true, false]);
    assert.equal(firstAudio(), 1);
    player.add(["Vier."]);
    await flush();
    assert.equal(server.requests.length, 3, "nothing is added after the end");
  });

  it("cancel aborts the pending requests, stops the audio and plays nothing more", async () => {
    const { player, server, audio, released, speaking, settled } = setup();
    player.add(["Een.", "Twee.", "Drie."]);
    await flush();
    server.requests[0]!.respond();
    await flush();
    assert.deepEqual(audio.played, ["blob:Een."]);
    assert.equal(audio.paused, false);
    const pending = server.requests[1]!;
    assert.equal(pending.settled, false);

    player.cancel();
    await player.done;
    assert.equal(settled(), true);
    assert.equal(pending.signal.aborted, true, "the request in flight is aborted");
    assert.equal(audio.paused, true, "the sound stops");
    await flush();
    assert.equal(server.requests.length, 2, "no new requests");
    assert.deepEqual(audio.played, ["blob:Een."]);
    assert.deepEqual(released, ["blob:Een."]);
    assert.deepEqual(speaking, [true], "the one who cancelled shows the state");
  });

  it("frees speech that arrives after a cancel without playing it", async () => {
    const released: string[] = [];
    let finishRequest!: (url: string) => void;
    const played: string[] = [];
    const player = createSpeechPlayer({
      synthesize: () => new Promise<string>((resolve) => (finishRequest = resolve)),
      play: async (url) => void played.push(url),
      release: (url) => released.push(url),
      speakBrowser: null,
    });
    player.add(["Een."]);
    await flush();
    player.cancel();
    finishRequest("blob:late");
    await player.done;
    await flush();
    assert.deepEqual(played, []);
    assert.deepEqual(released, ["blob:late"]);
  });

  it("a failed request: the rest of the answer goes to the browser's voice", async () => {
    const { player, server, audio, browser, speaking } = setup();
    player.add(["Een.", "Twee.", "Drie."]);
    await flush();
    server.requests[0]!.respond();
    await flush();
    server.requests[1]!.fail(503);
    await flush();
    audio.finish();
    player.add(["Vier."]);
    player.end();
    await player.done;
    assert.deepEqual(audio.played, ["blob:Een."]);
    assert.deepEqual(browser, ["Twee.", "Drie.", "Vier."]);
    assert.deepEqual(server.texts(), ["Een.", "Twee."], "no more requests after the failure");
    assert.deepEqual(speaking, [true, false]);
  });

  it("audio that can't play (blocked or broken) also falls back from that chunk on", async () => {
    const blocked = setup();
    blocked.audio.block = true;
    blocked.player.add(["Een.", "Twee."]);
    blocked.player.end();
    await flush();
    blocked.server.requests[0]!.respond();
    await blocked.player.done;
    assert.deepEqual(blocked.browser, ["Een.", "Twee."]);
    assert.equal(blocked.firstAudio(), 1, "the browser's first utterance counts as the first sound");

    const broken = setup();
    broken.player.add(["Een.", "Twee.", "Drie."]);
    broken.player.end();
    await flush();
    broken.server.requests[0]!.respond();
    await flush();
    broken.audio.finish();
    await flush();
    broken.server.requests[1]!.respond();
    await flush();
    broken.audio.break();
    await broken.player.done;
    assert.deepEqual(broken.audio.played, ["blob:Een.", "blob:Twee."]);
    assert.deepEqual(broken.browser, ["Twee.", "Drie."]);
  });

  it("stops quietly when the server voice fails and there is no browser voice", async () => {
    const { player, server, browser, speaking } = setup({ browser: false });
    player.add(["Een.", "Twee."]);
    player.end();
    await flush();
    server.requests[0]!.fail();
    await player.done;
    assert.deepEqual(browser, []);
    assert.deepEqual(speaking, [true, false]);
  });
});

describe("speech player, browser voice only", () => {
  it("queues every chunk with the browser's voice as it arrives", async () => {
    const { player, server, browser, speaking } = setup({ server: false });
    player.add(["Een."]);
    await flush();
    assert.deepEqual(browser, ["Een."]);
    player.add(["Twee."]);
    player.end();
    await player.done;
    assert.deepEqual(browser, ["Een.", "Twee."]);
    assert.deepEqual(server.texts(), []);
    assert.deepEqual(speaking, [true, false]);
  });

  it("an empty answer never reports speaking", async () => {
    const { player, speaking } = setup({ server: false });
    player.add(["", "   "]);
    player.end();
    await player.done;
    assert.deepEqual(speaking, []);
  });
});
