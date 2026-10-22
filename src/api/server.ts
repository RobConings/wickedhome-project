import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { startTtsWarmup } from "@ai/core/assistant-tts";
import { createApp } from "./app";
import { startHomeAssistantIntegration, stopHomeAssistantIntegration } from "./home-assistant/home-assistant.lifecycle";
import { startScheduler, stopScheduler } from "./jobs/job-scheduler";
import { config, isProduction } from "./lib/config";
import { db } from "./lib/db";

/**
 * One process serves both the API (/api) and the React app:
 * - development: Vite runs as middleware, with hot reload over the same HTTP server
 * - production: the built app in dist/client, with index.html as SPA fallback
 */
const app = createApp();
const server = createServer(app);

if (isProduction) {
  const clientDir = path.resolve(import.meta.dirname, "client");
  // Hashed build files never change under the same name; a missing one is a 404, not the SPA page.
  app.use("/assets", express.static(path.join(clientDir, "assets"), { maxAge: "1y", immutable: true, fallthrough: false }));
  // Everything else (service worker, manifest, icons) is revalidated, so installed apps pick up updates.
  app.use(express.static(clientDir, { index: false, maxAge: 0 }));
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDir, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(config.PORT, config.HOST, () => {
  console.log(`WickedHome listening on http://${config.HOST}:${config.PORT} (${config.NODE_ENV})`);
  // Scheduled jobs (docs/AUTOMATIONS.md): only once the app is up, so they never delay startup.
  void startScheduler();
  // Home Assistant WebSocket (docs/INTEGRATIONS.md): a no-op until HOME_ASSISTANT_URL/TOKEN are set.
  startHomeAssistantIntegration();
  // Speech output (ai/docs/ASSISTANT.md): loads every voice once, so none loads mid-answer. A no-op without ASSISTANT_TTS_URL.
  startTtsWarmup();
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await stopHomeAssistantIntegration();
  await stopScheduler();
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
