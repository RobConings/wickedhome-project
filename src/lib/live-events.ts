import * as React from "react";
import { LIVE_READY_EVENT, type LiveEvent } from "@/types/live-events";

// Live events from the server (Server-Sent Events on /api/events, see src/api/lib/events.ts).
// One EventSource per page, shared by every hook and opened only while something listens. EventSource
// reconnects by itself after a network error; when the server refuses the stream (logged out, restarted
// behind a proxy) we reconnect ourselves with a growing delay.

/**
 * idle: nothing listens · connecting: first connect · open: live · reconnecting: lost, trying again ·
 * offline: the browser is offline, or several reconnects in a row failed.
 */
export type LiveEventsStatus = "idle" | "connecting" | "open" | "reconnecting" | "offline";

type Handler = (event: LiveEvent) => void;

const EVENTS_URL = "/api/events";
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
/** After this many failed reconnects in a row the status says offline (it keeps retrying). */
const OFFLINE_AFTER_FAILURES = 3;

class LiveEventsConnection {
  private source: EventSource | null = null;
  private handlers = new Map<string, Set<Handler>>();
  /** Event types the current EventSource already forwards. */
  private attached = new Set<string>();
  private retryMs = MIN_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private watchingNetwork = false;
  private status: LiveEventsStatus = "idle";
  private statusListeners = new Set<() => void>();

  getStatus = () => this.status;

  subscribeStatus = (listener: () => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  private setStatus(status: LiveEventsStatus) {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener();
  }

  /** Registers a handler for one event type; returns the unregister function. */
  on(type: string, handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    this.watchNetwork();
    if (this.source) this.attach(type);
    else this.connect();
    return () => {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(type);
      if (this.handlers.size === 0) this.disconnect();
    };
  }

  private dispatch = (message: MessageEvent<string>) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(message.data) as LiveEvent;
    } catch {
      return;
    }
    for (const handler of this.handlers.get(message.type) ?? []) {
      try {
        handler(event);
      } catch (error) {
        console.error("live event handler failed", error);
      }
    }
  };

  private attach(type: string) {
    if (!this.source || this.attached.has(type)) return;
    this.source.addEventListener(type, this.dispatch as EventListener);
    this.attached.add(type);
  }

  /** Browser offline: say so at once; back online: reconnect now instead of waiting for the backoff. */
  private watchNetwork() {
    if (this.watchingNetwork || typeof window === "undefined") return;
    this.watchingNetwork = true;
    window.addEventListener("offline", () => {
      if (this.handlers.size > 0) this.setStatus("offline");
    });
    window.addEventListener("online", () => {
      if (this.handlers.size === 0) return;
      this.retryMs = MIN_RETRY_MS;
      this.source?.close();
      this.source = null;
      this.connect();
    });
  }

  private connect() {
    if (this.source || typeof EventSource === "undefined") return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus("offline");
      return;
    }
    if (this.status === "idle" || this.status === "connecting") this.setStatus("connecting");
    else if (this.status !== "offline") this.setStatus("reconnecting");
    const source = new EventSource(EVENTS_URL, { withCredentials: true });
    this.source = source;
    this.attached.clear();
    // Always listen for `ready`, to know when the stream is live.
    this.attach(LIVE_READY_EVENT);
    for (const type of this.handlers.keys()) this.attach(type);
    source.addEventListener("open", () => {
      this.retryMs = MIN_RETRY_MS;
      this.failures = 0;
      this.setStatus("open");
    });
    source.addEventListener("error", () => {
      this.failures += 1;
      const lost = this.failures >= OFFLINE_AFTER_FAILURES ? "offline" : "reconnecting";
      if (source.readyState === EventSource.CLOSED) {
        // The server refused (4xx/5xx) or the stream ended for good: retry later ourselves.
        this.source = null;
        this.setStatus(lost);
        this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
      } else {
        this.setStatus(lost);
      }
    });
  }

  private disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.source?.close();
    this.source = null;
    this.attached.clear();
    this.retryMs = MIN_RETRY_MS;
    this.failures = 0;
    this.setStatus("idle");
  }
}

const connection = new LiveEventsConnection();

export type UseLiveEventsOptions = {
  /** Set to false to not connect (Storybook, tests, screens that are not live). Default true. */
  enabled?: boolean;
};

/**
 * Calls `handler(data, event)` for every live event of `eventType` (e.g. `"device.value"`) while the
 * component is mounted. The handler may change between renders without reconnecting. Listen to `"ready"`
 * to reload data after a (re)connect, since events missed while offline are not replayed.
 */
export function useLiveEvents<T = unknown>(
  eventType: string,
  handler: (data: T, event: LiveEvent<T>) => void,
  { enabled = true }: UseLiveEventsOptions = {},
): void {
  const handlerRef = React.useRef(handler);
  React.useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  React.useEffect(() => {
    if (!enabled) return;
    return connection.on(eventType, (event) => handlerRef.current(event.data as T, event as LiveEvent<T>));
  }, [eventType, enabled]);
}

/** The shared stream's state, e.g. for a "Live" badge. */
export function useLiveEventsStatus(): LiveEventsStatus {
  return React.useSyncExternalStore(connection.subscribeStatus, connection.getStatus, () => "idle" as const);
}
