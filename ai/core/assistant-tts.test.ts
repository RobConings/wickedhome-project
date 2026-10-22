/**
 * Speech output: settings, the TTS client and the `/speech` + `/voices` routes against a fake Piper and a fake
 * OpenAI-compatible speech server. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/core/assistant-tts.test.ts
 */
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import type { SessionUser } from "@/features/auth/types/auth";
import { errorHandler } from "@/api/lib/http";
import { normaliseTtsUrl, readTtsSettings, type TtsSettings } from "./assistant-config";
import { SpeechError, clearVoiceCache, listVoices, synthesize, ttsStatus } from "./assistant-tts";
import { createSpeechRoutes } from "./assistant-tts.routes";

// ── A fake speech server: Piper at /, OpenAI-compatible at /v1 ────────────────────────────────────────

const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40, 1)]);
type Seen = { path: string; body: Record<string, unknown>; auth: string | undefined };
let seen: Seen[] = [];
let upstreamClosed = 0;
let listOpenAiVoices = false;
let piperDown = false;

const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    seen.push({ path: `${req.method} ${req.url}`, body, auth: req.headers.authorization });
    const text = String(body.text ?? body.input ?? "");
    if (req.url === "/voices") {
      if (piperDown) return void res.writeHead(503).end();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          "nl_BE-nathalie-medium": { language: { family: "nl", code: "nl_BE" }, phoneme_id_map: { a: [1] } },
          "nl_BE-rdh-medium": { language: { family: "nl", code: "nl_BE" } },
          "en_GB-alba-medium": { language: { family: "en", code: "en_GB" } },
          "fr_FR-siwis-medium": { language: { family: "fr", code: "fr_FR" } },
        }),
      );
      return;
    }
    if (req.url === "/v1/audio/voices") {
      if (!listOpenAiVoices) return void res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ voices: [{ id: "af_bella" }, { id: "nl_NL-anna" }, { id: "de_DE-thorsten" }] }));
      return;
    }
    if (req.url === "/synthesize" || req.url === "/v1/audio/speech") {
      if (text.includes("fail")) return void res.writeHead(500, { "Content-Type": "text/plain" }).end("boom");
      if (text.includes("json")) return void res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      // The real Piper labels its WAV text/html.
      if (text.includes("html")) return void res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(WAV);
      if (text.includes("slow")) {
        res.on("close", () => (upstreamClosed += 1));
        setTimeout(() => !res.destroyed && res.writeHead(200, { "Content-Type": "audio/wav" }).end(WAV), 3_000);
        return;
      }
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": String(WAV.length) });
      res.end(WAV);
      return;
    }
    res.writeHead(404).end();
  });
});

// ── Our routes in a tiny app with a fake logged-in user ───────────────────────────────────────────────

let settings: TtsSettings;
const user = { id: "u1", role: "adult", locale: "nl" } as unknown as SessionUser;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (req.get("x-test-user") === "1") req.user = user;
  next();
});
app.use("/api/assistant", createSpeechRoutes(() => settings));
app.use(errorHandler);
let appServer: Server;

let fakeUrl = "";
let appUrl = "";
before(async () => {
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  appServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => appServer.once("listening", resolve));
  appUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
});
after(() => {
  fake.close();
  appServer.close();
});

const piper = (extra: Record<string, string> = {}) => readTtsSettings({ ASSISTANT_TTS_URL: fakeUrl, ...extra });
const openai = (extra: Record<string, string> = {}) =>
  readTtsSettings({ ASSISTANT_TTS_URL: `${fakeUrl}/v1`, ASSISTANT_TTS_KIND: "openai", ASSISTANT_TOKEN: "secret", ...extra });

beforeEach(() => {
  seen = [];
  upstreamClosed = 0;
  listOpenAiVoices = false;
  piperDown = false;
  clearVoiceCache();
  settings = piper();
});

const post = (body: unknown, loggedIn = true) =>
  fetch(`${appUrl}/api/assistant/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(loggedIn ? { "x-test-user": "1" } : {}) },
    body: JSON.stringify(body),
  });
const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

// ── Settings ──────────────────────────────────────────────────────────────────────────────────────────

describe("readTtsSettings", () => {
  it("is off without a URL and keeps the defaults", () => {
    const value = readTtsSettings({});
    assert.equal(value.url, null);
    assert.equal(value.problem, null);
    assert.equal(value.kind, "piper");
    assert.deepEqual(value.voices, { nl: "nl_BE-nathalie-medium", en: "en_GB-alba-medium" });
    assert.equal(value.speed, null);
  });

  it("keeps the URL as given (no /v1 appended) and strips the trailing slash", () => {
    assert.equal(normaliseTtsUrl("http://127.0.0.1:5005"), "http://127.0.0.1:5005");
    assert.equal(normaliseTtsUrl("http://127.0.0.1:5005/"), "http://127.0.0.1:5005");
    assert.equal(normaliseTtsUrl("http://gpu:8000/v1/?x=1#y"), "http://gpu:8000/v1");
    assert.equal(normaliseTtsUrl("ftp://x"), null);
    assert.equal(normaliseTtsUrl("http://user:pw@x"), null);
  });

  it("reports problems instead of throwing", () => {
    assert.equal(readTtsSettings({ ASSISTANT_TTS_URL: "nope" }).problem, "invalid_url");
    const kind = readTtsSettings({ ASSISTANT_TTS_URL: "http://a:1", ASSISTANT_TTS_KIND: "espeak" });
    assert.equal(kind.problem, "invalid_kind");
    assert.equal(kind.url, null);
    const speed = readTtsSettings({ ASSISTANT_TTS_URL: "http://a:1", ASSISTANT_TTS_SPEED: "5" });
    assert.equal(speed.problem, "invalid_speed");
    assert.equal(speed.url, "http://a:1");
    assert.equal(speed.speed, null);
  });

  it("reads kind, model, voices, speed (comma or dot) and the token", () => {
    const value = readTtsSettings({
      ASSISTANT_TTS_URL: "http://gpu:8000/v1",
      ASSISTANT_TTS_KIND: "OpenAI",
      ASSISTANT_TTS_MODEL: "kokoro",
      ASSISTANT_TTS_VOICE_NL: "nl_BE-rdh-medium",
      ASSISTANT_TTS_VOICE_EN: "af_bella",
      ASSISTANT_TTS_SPEED: "1,25",
      ASSISTANT_API_KEY: "k",
    });
    assert.equal(value.kind, "openai");
    assert.equal(value.model, "kokoro");
    assert.deepEqual(value.voices, { nl: "nl_BE-rdh-medium", en: "af_bella" });
    assert.equal(value.speed, 1.25);
    assert.equal(value.apiKey, "k");
    assert.equal(readTtsSettings({ ASSISTANT_TTS_URL: "http://a:1" }).model, "tts-1");
  });
});

// ── Client ────────────────────────────────────────────────────────────────────────────────────────────

describe("listVoices / ttsStatus", () => {
  it("lists Piper's Dutch and English voices only, cached", async () => {
    const list = await listVoices(settings);
    assert.equal(list.ok, true);
    assert.deepEqual(
      list.voices.map((voice) => `${voice.id}:${voice.locale}`),
      ["en_GB-alba-medium:en", "nl_BE-nathalie-medium:nl", "nl_BE-rdh-medium:nl"],
    );
    await listVoices(settings);
    assert.equal(seen.filter((entry) => entry.path === "GET /voices").length, 1);
  });

  it("status: not configured, configured and reachable, unreachable", async () => {
    const off = await ttsStatus(readTtsSettings({}));
    assert.equal(off.configured, false);
    assert.equal(off.ok, null);
    const on = await ttsStatus(settings);
    assert.equal(on.configured, true);
    assert.equal(on.ok, true);
    assert.equal(on.voices.length, 3);
    assert.equal(on.host, new URL(fakeUrl).host);
    assert.deepEqual(on.defaults, { nl: "nl_BE-nathalie-medium", en: "en_GB-alba-medium" });
    const down = await ttsStatus(readTtsSettings({ ASSISTANT_TTS_URL: "http://127.0.0.1:1" }), 1_000);
    assert.equal(down.ok, false);
    assert.deepEqual(down.voices, []);
  });

  it("openai kind: the configured voices when the server doesn't list any, else its nl/en/unknown ones", async () => {
    const unlisted = await listVoices(openai());
    assert.equal(unlisted.ok, true);
    assert.deepEqual(unlisted.voices.map((voice) => voice.id).sort(), ["en_GB-alba-medium", "nl_BE-nathalie-medium"]);
    clearVoiceCache();
    listOpenAiVoices = true;
    const listed = await listVoices(openai());
    assert.deepEqual(
      listed.voices.map((voice) => `${voice.id}:${voice.locale}`),
      ["af_bella:null", "nl_NL-anna:nl"],
    );
    assert.equal(seen.at(-1)?.auth, "Bearer secret");
  });
});

describe("synthesize", () => {
  it("piper: default voice per language, speed as length_scale", async () => {
    const speech = await synthesize(piper({ ASSISTANT_TTS_SPEED: "1.25" }), { text: "Goedemorgen.", locale: "nl" });
    assert.equal(speech.voice, "nl_BE-nathalie-medium");
    assert.equal(speech.contentType, "audio/wav");
    assert.equal(speech.contentLength, WAV.length);
    assert.deepEqual(Buffer.from(await new Response(speech.body).arrayBuffer()), WAV);
    const call = seen.find((entry) => entry.path === "POST /synthesize");
    assert.deepEqual(call?.body, { text: "Goedemorgen.", voice: "nl_BE-nathalie-medium", length_scale: 0.8 });
    assert.equal(call?.auth, undefined);
  });

  it("accepts a WAV labelled text/html (as Piper sends it), by its RIFF header", async () => {
    const speech = await synthesize(settings, { text: "html please", locale: "nl" });
    assert.equal(speech.contentType, "audio/wav");
    assert.deepEqual(Buffer.from(await new Response(speech.body).arrayBuffer()), WAV);
  });

  it("falls back to the language's first voice when the configured default isn't on the server", async () => {
    const speech = await synthesize(piper({ ASSISTANT_TTS_VOICE_EN: "en_US-gone-high" }), { text: "Hi.", locale: "en" });
    assert.equal(speech.voice, "en_GB-alba-medium");
  });

  it("refuses a voice the server doesn't have (after one fresh look)", async () => {
    await assert.rejects(synthesize(settings, { text: "Hoi.", locale: "nl", voice: "fr_FR-siwis-medium" }), (error: unknown) => {
      assert.ok(error instanceof SpeechError);
      assert.equal(error.code, "invalid_voice");
      return true;
    });
    assert.equal(seen.filter((entry) => entry.path === "GET /voices").length, 2);
    assert.equal(seen.filter((entry) => entry.path === "POST /synthesize").length, 0);
  });

  it("openai kind: /audio/speech with model, voice, wav and the bearer token", async () => {
    const speech = await synthesize(openai({ ASSISTANT_TTS_MODEL: "kokoro", ASSISTANT_TTS_SPEED: "0.9" }), { text: "Hello there.", locale: "en" });
    assert.equal(speech.voice, "en_GB-alba-medium");
    await speech.body.cancel();
    const call = seen.find((entry) => entry.path === "POST /v1/audio/speech");
    assert.deepEqual(call?.body, { model: "kokoro", voice: "en_GB-alba-medium", input: "Hello there.", response_format: "wav", speed: 0.9 });
    assert.equal(call?.auth, "Bearer secret");
  });

  it("errors: not configured, upstream failure, unexpected answer, unreachable, timeout", async () => {
    const code = async (promise: Promise<unknown>) => {
      try {
        await promise;
        return "resolved";
      } catch (error) {
        return error instanceof SpeechError ? error.code : String(error);
      }
    };
    assert.equal(await code(synthesize(readTtsSettings({}), { text: "x", locale: "nl" })), "not_configured");
    assert.equal(await code(synthesize(settings, { text: "fail", locale: "nl" })), "failed");
    assert.equal(await code(synthesize(settings, { text: "json", locale: "nl" })), "failed");
    assert.equal(await code(synthesize(readTtsSettings({ ASSISTANT_TTS_URL: "http://127.0.0.1:1" }), { text: "x", locale: "nl" })), "unreachable");
    assert.equal(await code(synthesize(settings, { text: "slow", locale: "nl" }, undefined, 200)), "timeout");
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────────────────────────────

describe("POST /api/assistant/speech", () => {
  it("streams the WAV back, not cacheable", async () => {
    const response = await post({ text: "Goedemorgen, Rob.", locale: "nl", voice: "nl_BE-rdh-medium" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/wav");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), WAV);
    assert.equal(seen.find((entry) => entry.path === "POST /synthesize")?.body.voice, "nl_BE-rdh-medium");
  });

  it("works with the openai kind too", async () => {
    settings = openai();
    const response = await post({ text: "Hello.", locale: "en" });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), WAV);
  });

  it("needs a logged-in user", async () => {
    const response = await post({ text: "Hoi.", locale: "nl" }, false);
    assert.equal(response.status, 401);
  });

  it("validates the input: text length, locale, voice format and the server's voices", async () => {
    assert.equal((await post({ text: "x".repeat(601), locale: "nl" })).status, 400);
    assert.equal((await post({ text: "  ", locale: "nl" })).status, 400);
    assert.equal((await post({ text: "Hoi.", locale: "fr" })).status, 400);
    assert.equal((await post({ text: "Hoi.", locale: "nl", voice: "../../etc" })).status, 400);
    const unknown = await post({ text: "Hoi.", locale: "nl", voice: "nl_BE-unknown-low" });
    assert.equal(unknown.status, 400);
    assert.equal(await errorCode(unknown), "invalid_voice");
  });

  it("answers 409 when not configured and 502 when the speech server fails or is down", async () => {
    settings = readTtsSettings({});
    const off = await post({ text: "Hoi.", locale: "nl" });
    assert.equal(off.status, 409);
    assert.equal(await errorCode(off), "not_configured");
    settings = piper();
    const failed = await post({ text: "fail", locale: "nl" });
    assert.equal(failed.status, 502);
    assert.equal(await errorCode(failed), "failed");
    piperDown = true;
    clearVoiceCache();
    const down = await post({ text: "Hoi.", locale: "nl" });
    assert.equal(down.status, 502);
    assert.equal(await errorCode(down), "unreachable");
  });

  it("aborts the upstream request when the browser goes away", async () => {
    await listVoices(settings); // warm the voice cache so the request goes straight to synthesis
    const body = JSON.stringify({ text: "slow sentence", locale: "nl" });
    await new Promise<void>((resolve) => {
      const req = httpRequest(`${appUrl}/api/assistant/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "x-test-user": "1" },
      });
      req.on("error", () => resolve());
      req.end(body);
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 300);
    });
    const deadline = Date.now() + 2_000;
    while (upstreamClosed === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(upstreamClosed, 1);
  });
});

describe("GET /api/assistant/voices", () => {
  it("lists the voices with the defaults", async () => {
    const response = await fetch(`${appUrl}/api/assistant/voices`, { headers: { "x-test-user": "1" } });
    assert.equal(response.status, 200);
    const status = (await response.json()) as { configured: boolean; ok: boolean; voices: { id: string }[]; defaults: { nl: string } };
    assert.equal(status.configured, true);
    assert.equal(status.ok, true);
    assert.equal(status.voices.length, 3);
    assert.equal(status.defaults.nl, "nl_BE-nathalie-medium");
    assert.equal((await fetch(`${appUrl}/api/assistant/voices`)).status, 401);
  });
});
