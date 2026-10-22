/**
 * The speech server's voice warm-up: every Dutch and English voice says one word once the app is up and
 * whenever the server comes back after being unreachable, one voice at a time, errors ignored. The logic with
 * a fake clock and fake server calls, and `startTtsWarmup` against a fake `fetch`. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/assistant-tts-warmup.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AssistantVoice } from "@/features/assistant/types/assistant";
import { readTtsSettings, type TtsSettings } from "./assistant-config";
import { clearVoiceCache, createTtsWarmup, listVoices, startTtsWarmup, type TtsWarmupDeps, type VoiceList } from "./assistant-tts";

const settings: TtsSettings = readTtsSettings({ ASSISTANT_TTS_URL: "http://speech.test:5000" });
const voices: AssistantVoice[] = [
  { id: "nl_BE-nathalie-medium", locale: "nl" },
  { id: "en_GB-alba-medium", locale: "en" },
  { id: "nl_BE-rdh-medium", locale: "nl" },
  { id: "de_DE-thorsten", locale: null },
];
const up: VoiceList = { ok: true, voices, listed: true };
const down: VoiceList = { ok: false, voices: [], listed: false };

async function flush() {
  for (let round = 0; round < 10; round += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function until(condition: () => boolean, what: string) {
  const deadline = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Fake server calls: `speak` waits until the test lets it finish (`next()`), or fails for `failing` voices. */
function fakeDeps(list: { current: VoiceList | Error }) {
  const spoken: { voice: string; locale: string; text: string }[] = [];
  const pending: (() => void)[] = [];
  const slept: number[] = [];
  const failing = new Set<string>();
  let busy = 0;
  let checks = 0;
  const deps: TtsWarmupDeps = {
    readSettings: () => settings,
    check: async () => {
      checks += 1;
      if (list.current instanceof Error) throw list.current;
      return list.current;
    },
    speak: (_settings, voice, locale, text) => {
      spoken.push({ voice, locale, text });
      if (failing.has(voice)) return Promise.reject(new Error("unreachable"));
      return new Promise<void>((resolve) => pending.push(resolve));
    },
    busy: () => busy > 0,
    sleep: async (ms) => {
      slept.push(ms);
      busy = Math.max(0, busy - 1);
    },
  };
  return {
    deps,
    spoken,
    slept,
    failing,
    checks: () => checks,
    setBusy: (polls: number) => (busy = polls),
    /** Lets the speech in progress finish. */
    next: async () => {
      await flush();
      pending.shift()?.();
      await flush();
    },
  };
}

describe("voice warm-up", () => {
  it("after start: every Dutch and English voice says one word, one at a time", async () => {
    const fake = fakeDeps({ current: up });
    const warmup = createTtsWarmup(fake.deps);
    const probe = warmup.probe();
    await flush();
    assert.deepEqual(fake.spoken, [{ voice: "nl_BE-nathalie-medium", locale: "nl", text: "Oké." }], "the next voice waits");
    await fake.next();
    assert.deepEqual(fake.spoken.at(-1), { voice: "en_GB-alba-medium", locale: "en", text: "Okay." });
    assert.equal(fake.spoken.length, 2);
    await fake.next();
    await fake.next();
    await probe;
    assert.deepEqual(
      fake.spoken.map((call) => call.voice),
      ["nl_BE-nathalie-medium", "en_GB-alba-medium", "nl_BE-rdh-medium"],
      "other languages are skipped",
    );
    assert.equal(warmup.warming(), null);
  });

  it("warms once while the server stays reachable, again after it was unreachable", async () => {
    const list: { current: VoiceList | Error } = { current: up };
    const fake = fakeDeps(list);
    const warmup = createTtsWarmup(fake.deps);
    const first = warmup.probe();
    for (let voice = 0; voice < 3; voice += 1) await fake.next();
    await first;
    assert.equal(fake.spoken.length, 3);

    await warmup.probe();
    assert.equal(fake.spoken.length, 3, "still reachable: no second warm-up");

    list.current = down;
    await warmup.probe();
    list.current = new Error("ECONNREFUSED");
    await warmup.probe();
    assert.equal(fake.spoken.length, 3);

    list.current = up;
    const back = warmup.probe();
    for (let voice = 0; voice < 3; voice += 1) await fake.next();
    await back;
    assert.equal(fake.spoken.length, 6, "back after being unreachable: warmed again");
    assert.equal(fake.checks(), 5);
  });

  it("starts from unreachable: warms when the server first answers", async () => {
    const list: { current: VoiceList | Error } = { current: new Error("ECONNREFUSED") };
    const fake = fakeDeps(list);
    const warmup = createTtsWarmup(fake.deps);
    await warmup.probe();
    assert.deepEqual(fake.spoken, []);
    list.current = up;
    const probe = warmup.probe();
    for (let voice = 0; voice < 3; voice += 1) await fake.next();
    await probe;
    assert.equal(fake.spoken.length, 3);
  });

  it("errors are ignored: every voice is still tried", async () => {
    const fake = fakeDeps({ current: up });
    fake.failing.add("nl_BE-nathalie-medium");
    fake.failing.add("en_GB-alba-medium");
    const warmup = createTtsWarmup(fake.deps);
    const probe = warmup.probe();
    await fake.next();
    await probe;
    assert.deepEqual(
      fake.spoken.map((call) => call.voice),
      ["nl_BE-nathalie-medium", "en_GB-alba-medium", "nl_BE-rdh-medium"],
    );
  });

  it("any fresh look at the voices counts; a look during the warm-up starts no second one", async () => {
    const fake = fakeDeps({ current: down });
    const warmup = createTtsWarmup(fake.deps);
    assert.equal(warmup.observe(settings, down), null);
    const warming = warmup.observe(settings, up);
    assert.ok(warming, "the server came back: warm-up started");
    assert.equal(warmup.observe(settings, up), warming);
    assert.equal(warmup.observe(settings, down), warming);
    assert.equal(warmup.observe(settings, up), warming, "still the same warm-up");
    for (let voice = 0; voice < 3; voice += 1) await fake.next();
    await warming;
    assert.equal(fake.spoken.length, 3);
  });

  it("waits for speech being made for someone (up to a minute), then goes ahead", async () => {
    const fake = fakeDeps({ current: up });
    fake.setBusy(3);
    const warmup = createTtsWarmup(fake.deps);
    const probe = warmup.probe();
    await flush();
    assert.deepEqual(fake.slept, [500, 500, 500]);
    assert.equal(fake.spoken.length, 1);

    // Busy for longer than a minute: the next voice goes ahead after 120 polls of 500 ms.
    fake.setBusy(10_000);
    await fake.next();
    assert.equal(fake.slept.length, 3 + 120);
    assert.equal(fake.spoken.length, 2);
    fake.setBusy(0);
    await fake.next();
    await fake.next();
    await probe;
    assert.equal(fake.spoken.length, 3);
  });

  it("does nothing without a speech server, or one that doesn't list its voices", async () => {
    const noServer = fakeDeps({ current: up });
    await createTtsWarmup({ ...noServer.deps, readSettings: () => readTtsSettings({}) }).probe();
    assert.equal(noServer.checks(), 0);

    const unlisted = fakeDeps({ current: { ok: true, voices, listed: false } });
    await createTtsWarmup(unlisted.deps).probe();
    assert.deepEqual(unlisted.spoken, []);
  });
});

// ── startTtsWarmup against a fake fetch ───────────────────────────────────────────────────────────────

describe("startTtsWarmup", () => {
  const realFetch = globalThis.fetch;
  let serverDown = false;
  let failVoice: string | null = null;
  let synthesized: { voice: string; text: string }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let stop: (() => void) | null = null;

  beforeEach(() => {
    clearVoiceCache();
    serverDown = false;
    failVoice = null;
    synthesized = [];
    inFlight = 0;
    maxInFlight = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (serverDown) throw new TypeError("fetch failed");
      if (url === "http://speech.test:5000/voices") {
        return Response.json({
          "nl_BE-nathalie-medium": { language: { family: "nl" } },
          "en_GB-alba-medium": { language: { family: "en" } },
          "fr_FR-siwis-medium": { language: { family: "fr" } },
        });
      }
      if (url === "http://speech.test:5000/synthesize") {
        const body = JSON.parse(String(init?.body)) as { voice: string; text: string };
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        synthesized.push({ voice: body.voice, text: body.text });
        if (body.voice === failVoice) return new Response("boom", { status: 500 });
        // Piper labels its WAV text/html.
        return new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]), { headers: { "Content-Type": "text/html" } });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    stop?.();
    stop = null;
    globalThis.fetch = realFetch;
  });

  it("synthesizes once per Dutch and English voice after start, one at a time", async () => {
    stop = startTtsWarmup({ intervalMs: 20, readSettings: () => settings });
    await until(() => synthesized.length === 2, "two warm-up requests");
    await new Promise((resolve) => setTimeout(resolve, 120)); // several periodic looks later
    // In the order the voice list has them (sorted by id); French is skipped.
    assert.deepEqual(synthesized, [
      { voice: "en_GB-alba-medium", text: "Okay." },
      { voice: "nl_BE-nathalie-medium", text: "Oké." },
    ]);
    assert.equal(maxInFlight, 1);
  });

  it("warms again when the server comes back, and ignores failed voices", async () => {
    serverDown = true;
    stop = startTtsWarmup({ intervalMs: 20, readSettings: () => settings });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(synthesized.length, 0);

    failVoice = "en_GB-alba-medium";
    serverDown = false;
    await until(() => synthesized.length === 2, "the warm-up after the server came back");
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(synthesized.length, 2, "once");
    assert.deepEqual(
      synthesized.map((call) => call.voice),
      ["en_GB-alba-medium", "nl_BE-nathalie-medium"],
      "the failed first voice doesn't stop the second",
    );
  });

  it("a voice list fetched for someone counts as a look at the server", async () => {
    serverDown = true;
    stop = startTtsWarmup({ intervalMs: 60_000, readSettings: () => settings });
    await new Promise((resolve) => setTimeout(resolve, 30));
    serverDown = false;
    await listVoices(settings, { fresh: true });
    await until(() => synthesized.length === 2, "the warm-up after the voice list");
  });

  it("stops: no more looks at the server", async () => {
    serverDown = true;
    stop = startTtsWarmup({ intervalMs: 10, readSettings: () => settings });
    stop();
    stop = null;
    serverDown = false;
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(synthesized.length, 0);
    await listVoices(settings, { fresh: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(synthesized.length, 0, "no observer left");
  });
});
