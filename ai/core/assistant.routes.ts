import express, { Router, type Request, type Response } from "express";
import {
  ASSISTANT_IMAGE_MAX_BYTES,
  ASSISTANT_IMAGE_TYPES,
  assistantConfirmationInputSchema,
  assistantMessageInputSchema,
  assistantRenameInputSchema,
  assistantTokenInputSchema,
} from "@/features/assistant/types/assistant";
import { idSchema } from "@/types/common";
import { HttpError, badRequest, parse } from "@/api/lib/http";
import { createRateLimiter } from "@/api/lib/rate-limit";
import { webSearchStatus } from "@/api/web/web.service";
import { currentUser, requireUser } from "@/api/lib/session";
import { readAssistantSettings } from "./assistant-config";
import { findRun, isRunning, startRun, type AssistantRun } from "./assistant-runs";
import { MAX_AUDIO_BYTES, TranscriptionError, transcribe } from "./assistant-stt";
import { ttsStatus } from "./assistant-tts";
import { createSpeechRoutes } from "./assistant-tts.routes";
import {
  AssistantNotConfiguredError,
  answerConfirmation,
  createToken,
  deleteConversation,
  getConversation,
  getImage,
  getStatus,
  listConversations,
  listTokens,
  renameConversation,
  resetToolPreferences,
  revokeToken,
  sendMessage,
  testConnection,
  uploadImage,
  type ChatOptions,
} from "./assistant.service";
import "./assistant.jobs";
import { mcpOAuthManageRouter } from "./mcp-oauth.routes";
import "./tool-audit";

/**
 * `/api/assistant`: conversations, the streamed chat (Server-Sent Events over a POST response), the
 * status card, speech to text, text to speech, the MCP tokens and OAuth (connected apps, consent). Tools
 * are registered by the skills (`ai/skills/<skill>/tools.ts`); see tools.ts and ai/docs/ASSISTANT.md.
 */
export const assistantRouter = Router();

assistantRouter.use(requireUser);

/** Questions per person: generous for a household, but a stuck client can't flood the model. */
const questionsPerUser = createRateLimiter({ limit: 60, windowMs: 15 * 60_000 });
const testsPerUser = createRateLimiter({ limit: 20, windowMs: 15 * 60_000 });
const transcriptionsPerUser = createRateLimiter({ limit: 60, windowMs: 15 * 60_000 });
const imagesPerUser = createRateLimiter({ limit: 60, windowMs: 15 * 60_000 });

/** Sends a run's events as `text/event-stream` (replay first), until `done` or the browser goes away. */
function watch(req: Request, res: Response, run: AssistantRun): Promise<void> {
  req.socket.setNoDelay(true);
  req.socket.setTimeout(0);
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  return new Promise((resolve) => {
    // A comment line now and then keeps proxies from closing the stream while the model loads.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": ping\n\n");
    }, 15_000);
    let unsubscribe: () => void = () => undefined;
    const finish = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
      resolve();
    };
    // The browser left: only this watcher stops; the answer goes on (and is stored).
    res.on("close", finish);
    unsubscribe = run.subscribe((event) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === "done") finish();
    });
    if (run.finished && run.events.at(-1)?.type !== "done") finish();
  });
}

/**
 * Starts `work` as a run (assistant-runs.ts) and watches it. Errors before its first event become normal
 * JSON errors (not configured → 409); a browser gone before then stops it, nothing was stored yet.
 */
async function startAndWatch(req: Request, res: Response, key: string, work: (options: ChatOptions) => Promise<void>) {
  const user = currentUser(req);
  let left = false;
  const onClose = () => {
    left = true;
  };
  res.on("close", onClose);
  let run: AssistantRun;
  try {
    run = await startRun(key, user.id, (current) =>
      work({ emit: (event) => current.push(event), signal: current.controller.signal, onSaved: (id) => current.savedIds.add(id) }),
    );
  } catch (error) {
    if (error instanceof AssistantNotConfiguredError) throw new HttpError(409, "not_configured", "The assistant is not configured");
    throw error;
  } finally {
    res.off("close", onClose);
  }
  if (left && run.events.length <= 1) {
    run.controller.abort();
    return;
  }
  await watch(req, res, run);
}

// ── Status ────────────────────────────────────────────────────────────────────────────────────────────

assistantRouter.get("/status", async (req, res) => {
  const [tts, web] = await Promise.all([ttsStatus(), webSearchStatus()]);
  res.json({ ...getStatus(currentUser(req)), tts, web });
});

assistantRouter.post("/status/test", async (req, res) => {
  testsPerUser.hit(currentUser(req).id);
  res.json(await testConnection());
});

// ── Conversations ─────────────────────────────────────────────────────────────────────────────────────

assistantRouter.get("/conversations", async (req, res) => {
  res.json(await listConversations(currentUser(req)));
});

/** A question in a new conversation: the first `start` event carries its id. */
assistantRouter.post("/conversations", async (req, res) => {
  const user = currentUser(req);
  const input = parse(assistantMessageInputSchema, req.body);
  questionsPerUser.hit(user.id);
  await startAndWatch(req, res, `new:${user.id}`, (options) => sendMessage(user, null, input, options));
});

/** `running`: an answer is still being written; the chat attaches with `GET …/stream` (its messages so far come from there). */
assistantRouter.get("/conversations/:id", async (req, res) => {
  const user = currentUser(req);
  const id = parse(idSchema, req.params.id);
  const run = findRun(id, user.id);
  const running = isRunning(run);
  res.json({ ...(await getConversation(user, id, running ? run.savedIds : undefined)), running });
});

/** Attach to the answer being written: every event so far, then the rest live. 204 when nothing runs. */
assistantRouter.get("/conversations/:id/stream", async (req, res) => {
  const user = currentUser(req);
  const id = parse(idSchema, req.params.id);
  await getConversation(user, id, new Set());
  const run = findRun(id, user.id);
  if (!run) {
    res.status(204).end();
    return;
  }
  await watch(req, res, run);
});

/** Stop the answer being written (closing the page no longer does). */
assistantRouter.post("/conversations/:id/stop", (req, res) => {
  const run = findRun(parse(idSchema, req.params.id), currentUser(req).id);
  if (isRunning(run)) run.controller.abort();
  res.status(204).end();
});

assistantRouter.patch("/conversations/:id", async (req, res) => {
  const { title } = parse(assistantRenameInputSchema, req.body);
  res.json(await renameConversation(currentUser(req), parse(idSchema, req.params.id), title));
});

assistantRouter.delete("/conversations/:id", async (req, res) => {
  await deleteConversation(currentUser(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

assistantRouter.post("/conversations/:id/messages", async (req, res) => {
  const user = currentUser(req);
  const id = parse(idSchema, req.params.id);
  const input = parse(assistantMessageInputSchema, req.body);
  questionsPerUser.hit(user.id);
  await startAndWatch(req, res, id, (options) => sendMessage(user, id, input, options));
});

assistantRouter.post("/conversations/:id/confirmations/:messageId", async (req, res) => {
  const user = currentUser(req);
  const id = parse(idSchema, req.params.id);
  const messageId = parse(idSchema, req.params.messageId);
  const input = parse(assistantConfirmationInputSchema, req.body);
  await startAndWatch(req, res, id, (options) => answerConfirmation(user, id, messageId, input, options));
});

/** Forget every "don't ask again". */
assistantRouter.delete("/preferences", async (req, res) => {
  res.json({ reset: await resetToolPreferences(currentUser(req)) });
});

// ── Images in questions ───────────────────────────────────────────────────────────────────────────────

/** An image for the next question (raw body, resized by the browser); the question sends its id. */
assistantRouter.post(
  "/images",
  express.raw({ type: [...ASSISTANT_IMAGE_TYPES, "application/octet-stream"], limit: ASSISTANT_IMAGE_MAX_BYTES }),
  async (req, res) => {
    const user = currentUser(req);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest("Send the image as the request body");
    imagesPerUser.hit(user.id);
    res.status(201).json(await uploadImage(user, req.body));
  },
);

assistantRouter.get("/images/:id", async (req, res) => {
  const image = await getImage(currentUser(req), parse(idSchema, req.params.id));
  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(image.data));
});

// ── Text to speech: POST /speech, GET /voices (assistant-tts.routes.ts)───────────────────────────────

assistantRouter.use(createSpeechRoutes());

// ── Speech to text ────────────────────────────────────────────────────────────────────────────────────

assistantRouter.post(
  "/transcribe",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: MAX_AUDIO_BYTES }),
  async (req, res) => {
    const user = currentUser(req);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest("Send the recording as the request body");
    transcriptionsPerUser.hit(user.id);
    const language = req.query.lang === "nl" ? "nl" : req.query.lang === "en" ? "en" : user.locale;
    try {
      const text = await transcribe(readAssistantSettings(), req.body, req.get("content-type") ?? "audio/webm", language);
      res.json({ text });
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw new HttpError(error.code === "not_configured" ? 409 : 502, error.code, error.message);
      }
      throw error;
    }
  },
);

// ── MCP access tokens ─────────────────────────────────────────────────────────────────────────────────

assistantRouter.get("/tokens", async (req, res) => {
  res.json(await listTokens(currentUser(req)));
});

assistantRouter.post("/tokens", async (req, res) => {
  res.status(201).json(await createToken(currentUser(req), parse(assistantTokenInputSchema, req.body)));
});

assistantRouter.delete("/tokens/:id", async (req, res) => {
  await revokeToken(currentUser(req), parse(idSchema, req.params.id));
  res.status(204).end();
});

// OAuth for the MCP server (ai/docs/MCP-OAUTH.md): connected apps, DCR settings, manual OAuth apps, the consent page.
assistantRouter.use("/oauth", mcpOAuthManageRouter);
