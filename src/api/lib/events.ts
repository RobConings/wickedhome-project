import { Router, type Response } from "express";
import { LIVE_READY_EVENT, type LiveEvent } from "@/types/live-events";
import { currentUser, requireUser } from "./session";

/**
 * Live events: a per-household, in-memory publish/subscribe bus and the `GET /api/events` Server-Sent
 * Events stream that forwards it to the browser (`useLiveEvents` in src/lib/live-events.ts).
 *
 * Wire format (one SSE message per event):
 *
 *   id: 42
 *   event: device.value
 *   data: {"type":"device.value","at":"2026-10-02T18:00:00.000Z","data":{…}}
 *
 * `data` is the JSON envelope `LiveEvent`. Events are fire-and-forget: there is no replay after a
 * reconnect, so clients reload their data when the stream (re)opens (the `ready` event). A comment line
 * (`: ping`) every 25 s keeps proxies from closing an idle stream. One process, so in-memory is enough; with
 * more processes this would move to Postgres LISTEN/NOTIFY behind the same `publish`/`subscribe`.
 *
 * nginx must not buffer the stream: `proxy_buffering off;` for /api/events (the `X-Accel-Buffering: no`
 * header below asks for the same per response). See docs/DEVICES.md.
 */

export type { LiveEvent };

type Listener = (event: LiveEvent, id: number) => void;

const HEARTBEAT_MS = 25_000;
/** Generous per-household cap, so a runaway tab loop can't exhaust the process. */
const MAX_STREAMS_PER_HOUSEHOLD = 50;

const listeners = new Map<string, Set<Listener>>();
let sequence = 0;

/** Sends an event to every open stream of one household. Never throws. */
export function publish<T>(householdId: string, type: string, data: T): void {
  const subscribers = listeners.get(householdId);
  if (!subscribers?.size) return;
  const event: LiveEvent<T> = { type, at: new Date().toISOString(), data };
  sequence += 1;
  for (const listener of subscribers) {
    try {
      listener(event, sequence);
    } catch (error) {
      console.error("live event listener failed", error);
    }
  }
}

/** Listens to one household's events (server-side consumers, tests). Returns the unsubscribe function. */
export function subscribe(householdId: string, listener: Listener): () => void {
  let subscribers = listeners.get(householdId);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(householdId, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(householdId);
  };
}

/** Number of open subscriptions of a household (diagnostics, tests). */
export const subscriberCount = (householdId: string) => listeners.get(householdId)?.size ?? 0;

function writeEvent(res: Response, type: string, payload: unknown, id?: number) {
  const lines = [id !== undefined ? `id: ${id}` : null, `event: ${type}`, `data: ${JSON.stringify(payload)}`].filter(Boolean);
  res.write(`${lines.join("\n")}\n\n`);
}

export const eventsRouter = Router();

/** `GET /api/events`: the signed-in user's household stream. Authenticated by the session cookie. */
eventsRouter.get("/", requireUser, (req, res) => {
  const { householdId } = currentUser(req);
  if (subscriberCount(householdId) >= MAX_STREAMS_PER_HOUSEHOLD) {
    res.status(429).json({ error: { code: "too_many_streams", message: "Too many open event streams" } });
    return;
  }

  req.socket.setKeepAlive(true);
  req.socket.setNoDelay(true);
  req.socket.setTimeout(0);
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  // no-transform: proxies and compression middleware must pass the stream through untouched.
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Reconnect after 5 s if the connection drops; then announce that the stream is live.
  res.write("retry: 5000\n\n");
  writeEvent(res, LIVE_READY_EVENT, { type: LIVE_READY_EVENT, at: new Date().toISOString(), data: null } satisfies LiveEvent<null>);

  const unsubscribe = subscribe(householdId, (event, id) => writeEvent(res, event.type, event, id));
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.on("close", close);
  res.on("error", close);
});
