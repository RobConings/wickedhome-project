import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Router } from "express";
import { assistantSpeechInputSchema } from "@/features/assistant/types/assistant";
import { HttpError, parse } from "@/api/lib/http";
import { createRateLimiter } from "@/api/lib/rate-limit";
import { currentUser } from "@/api/lib/session";
import { readTtsSettings, type TtsSettings } from "./assistant-config";
import { SpeechError, synthesize, ttsStatus } from "./assistant-tts";

const STATUS_OF: Record<SpeechError["code"], number> = {
  not_configured: 409,
  invalid_voice: 400,
  unreachable: 502,
  timeout: 502,
  failed: 502,
  aborted: 499,
};

/**
 * `POST /speech` (one chunk of text → WAV, streamed through) and `GET /voices`, mounted under `/api/assistant`
 * after `requireUser`. A function so tests can pass their own settings (ai/core/assistant-tts.test.ts).
 */
export function createSpeechRoutes(readSettings: () => TtsSettings = () => readTtsSettings()) {
  const router = Router();
  /** An answer is a handful of chunks, plus the voice tests: generous, but a stuck client can't hog the server. */
  const speechPerUser = createRateLimiter({ limit: 600, windowMs: 15 * 60_000 });

  router.get("/voices", async (req, res) => {
    currentUser(req);
    res.setHeader("Cache-Control", "no-store");
    res.json(await ttsStatus(readSettings(), 5_000));
  });

  router.post("/speech", async (req, res) => {
    const user = currentUser(req);
    const input = parse(assistantSpeechInputSchema, req.body);
    speechPerUser.hit(user.id);
    const controller = new AbortController();
    // The browser skipped ahead or closed the page: stop the server's work too.
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    let speech;
    try {
      speech = await synthesize(readSettings(), input, controller.signal);
    } catch (error) {
      if (error instanceof SpeechError) {
        if (error.code === "aborted") return;
        throw new HttpError(STATUS_OF[error.code], error.code, error.message);
      }
      throw error;
    }
    res.status(200);
    res.setHeader("Content-Type", speech.contentType);
    // Personal text: never kept by the browser, a proxy or the service worker.
    res.setHeader("Cache-Control", "no-store");
    if (speech.contentLength) res.setHeader("Content-Length", String(speech.contentLength));
    try {
      await pipeline(Readable.fromWeb(speech.body as unknown as NodeReadableStream<Uint8Array>), res);
    } catch {
      // The browser went away or the speech server broke off mid-answer: nothing more to send.
      controller.abort();
      if (!res.destroyed) res.destroy();
    }
  });

  return router;
}
