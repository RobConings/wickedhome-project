import WebSocket from "ws";
import type { HaConnectionState, HaErrorCode } from "@/features/home-assistant/types/home-assistant";
import { nextBackoffMs } from "./ha-backoff";

/**
 * A small client for Home Assistant's WebSocket API (https://developers.home-assistant.io/docs/api/websocket):
 *
 * - auth handshake (`auth_required` → `auth` with the long-lived token → `auth_ok` / `auth_invalid`)
 * - numbered commands with a result (`sendCommand`), with a timeout each
 * - event subscriptions that survive reconnects (`subscribeEvents`)
 * - a ping every 30 s; no pong within 10 s → reconnect
 * - automatic reconnect with exponential backoff (ha-backoff.ts)
 *
 * It knows nothing about devices, energy or the database; ha-connection.ts wires it into the app.
 * The token is only ever sent in the auth message: it is never logged or put in an error.
 */

export type HaState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  last_reported?: string;
};

export type HaEvent = {
  event_type: string;
  data: Record<string, unknown>;
  time_fired?: string;
};

export type StateChangedData = { entity_id: string; old_state: HaState | null; new_state: HaState | null };

export class HaNotConnectedError extends Error {
  constructor() {
    super("Home Assistant is not connected");
  }
}

export class HaCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The transport, injectable for tests. The default uses the `ws` package. */
export type HaSocketHandlers = {
  open: () => void;
  message: (text: string) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
};
export type HaSocket = { send: (text: string) => void; close: () => void };
export type HaSocketFactory = (url: string, handlers: HaSocketHandlers) => HaSocket;

export const wsSocketFactory: HaSocketFactory = (url, handlers) => {
  const socket = new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 64 * 1024 * 1024 });
  socket.on("open", handlers.open);
  socket.on("message", (data) => handlers.message(Array.isArray(data) ? Buffer.concat(data).toString("utf8") : data.toString("utf8")));
  socket.on("close", (code, reason) => handlers.close(code, reason.toString("utf8")));
  socket.on("error", handlers.error);
  return {
    send: (text) => socket.send(text),
    close: () => {
      try {
        if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
        else socket.close(1000);
      } catch {
        // already closed
      }
    },
  };
};

/** `http(s)://host:8123[/path]` → `ws(s)://host:8123[/path]/api/websocket`. */
export function websocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/api\/websocket$/, "")}/api/websocket`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export type HaClientStatus = {
  state: Exclude<HaConnectionState, "not_configured">;
  haVersion: string | null;
  connectedAt: Date | null;
  errorCode: HaErrorCode | null;
  errorMessage: string | null;
  nextRetryAt: Date | null;
  attempt: number;
};

export type HaClientOptions = {
  url: string;
  token: string;
  socketFactory?: HaSocketFactory;
  commandTimeoutMs?: number;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  backoff?: (attempt: number, authFailed: boolean) => number;
  log?: (message: string) => void;
};

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type Subscription = { eventType: string; handler: (event: HaEvent) => void; haId: number | null };

const AUTH_TIMEOUT_MS = 15_000;

export class HomeAssistantClient {
  private socket: HaSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private subscriptions = new Map<number, Subscription>();
  private nextSubscriptionKey = 1;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private authenticated = false;
  private stopped = true;
  private authFailed = false;
  private statusListeners = new Set<(status: HaClientStatus) => void>();
  private connectedListeners = new Set<() => void>();
  private status: HaClientStatus = {
    state: "connecting",
    haVersion: null,
    connectedAt: null,
    errorCode: null,
    errorMessage: null,
    nextRetryAt: null,
    attempt: 0,
  };
  private readonly socketFactory: HaSocketFactory;
  private readonly commandTimeoutMs: number;
  private readonly pingIntervalMs: number;
  private readonly pongTimeoutMs: number;
  private readonly backoff: (attempt: number, authFailed: boolean) => number;
  private readonly log: (message: string) => void;

  constructor(private readonly options: HaClientOptions) {
    this.socketFactory = options.socketFactory ?? wsSocketFactory;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 30_000;
    this.pongTimeoutMs = options.pongTimeoutMs ?? 10_000;
    this.backoff = options.backoff ?? ((attempt, authFailed) => nextBackoffMs(attempt, { authFailed }));
    this.log = options.log ?? ((message) => console.log(`[home-assistant] ${message}`));
  }

  getStatus = (): HaClientStatus => ({ ...this.status });
  get connected() {
    return this.authenticated;
  }

  onStatus(listener: (status: HaClientStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Called after every successful (re)connect, once subscriptions are re-established. */
  onConnected(listener: () => void): () => void {
    this.connectedListeners.add(listener);
    return () => this.connectedListeners.delete(listener);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  /** Closes the connection for good: no reconnects, pending commands are rejected. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.teardown(new HaNotConnectedError());
  }

  /** Drop the current connection and reconnect now (the card's "Test connection" when it is down). */
  reconnectNow(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.authenticated) return;
    this.teardown(new HaNotConnectedError());
    this.connect();
  }

  /** Sends one command (`type` + fields, without `id`) and resolves with its `result`. */
  sendCommand<T = unknown>(message: { type: string; [key: string]: unknown }, timeoutMs = this.commandTimeoutMs): Promise<T> {
    if (isDisarmCall(message)) {
      return Promise.reject(new HaCommandError("forbidden", "Disarming only goes through disarmAlarmPanel (UI, code, audit log)"));
    }
    if (!this.authenticated || !this.socket) return Promise.reject(new HaNotConnectedError());
    return this.send<T>(message, timeoutMs);
  }

  /**
   * Disarms an alarm panel. Only `disarmAlarm` in ha-alarm.ts calls this, after its guard (signed-in owner or
   * adult in the UI, code, rate limit, audit log). Never wire this into the assistant, MCP or voice.
   */
  disarmAlarmPanel(entityId: string, code: string): Promise<unknown> {
    if (!this.authenticated || !this.socket) return Promise.reject(new HaNotConnectedError());
    return this.send({
      type: "call_service",
      domain: "alarm_control_panel",
      service: "alarm_disarm",
      service_data: { code },
      target: { entity_id: entityId },
    });
  }

  /**
   * Subscribes to one event type (`state_changed`). The subscription is re-sent after every reconnect.
   * Returns the unsubscribe function.
   */
  subscribeEvents(eventType: string, handler: (event: HaEvent) => void): () => void {
    const key = this.nextSubscriptionKey++;
    const subscription: Subscription = { eventType, handler, haId: null };
    this.subscriptions.set(key, subscription);
    if (this.authenticated) void this.sendSubscription(subscription);
    return () => {
      this.subscriptions.delete(key);
      if (subscription.haId !== null && this.authenticated) {
        void this.send({ type: "unsubscribe_events", subscription: subscription.haId }).catch(() => undefined);
      }
    };
  }

  // Internals ------------------------------------------------------------------------------------------------

  private setStatus(change: Partial<HaClientStatus>) {
    this.status = { ...this.status, ...change };
    const snapshot = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[home-assistant] status listener failed", error);
      }
    }
  }

  private connect() {
    if (this.stopped || this.socket) return;
    this.authenticated = false;
    this.setStatus({ state: "connecting", nextRetryAt: null });
    let url: string;
    try {
      url = websocketUrl(this.options.url);
    } catch {
      this.fail("protocol", "HOME_ASSISTANT_URL is not a valid URL");
      return;
    }
    let socket: HaSocket | null = null;
    let socketError: string | null = null;
    const isCurrent = () => socket !== null && this.socket === socket;
    socket = this.socketFactory(url, {
      open: () => {
        if (!isCurrent()) return;
        this.authTimer = setTimeout(() => {
          if (isCurrent() && !this.authenticated) this.drop("timeout", "No auth_ok from Home Assistant");
        }, AUTH_TIMEOUT_MS);
        this.authTimer.unref?.();
      },
      message: (text) => {
        if (isCurrent()) this.handleText(text);
      },
      close: (code, reason) => {
        if (!isCurrent()) return;
        this.socket = null;
        this.teardown(new HaNotConnectedError());
        this.fail("unreachable", socketError ?? `Connection closed (${code}${reason ? `: ${reason}` : ""})`);
      },
      error: (error) => {
        if (isCurrent()) socketError = describeSocketError(error);
      },
    });
    this.socket = socket;
  }

  private handleText(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.log("ignored a message that is not JSON");
      return;
    }
    // With coalesce_messages a frame may carry an array of messages.
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      if (message && typeof message === "object") this.handleMessage(message as Record<string, unknown>);
    }
  }

  private handleMessage(message: Record<string, unknown>) {
    switch (message.type) {
      case "auth_required":
        this.socket?.send(JSON.stringify({ type: "auth", access_token: this.options.token }));
        return;
      case "auth_ok":
        if (this.authTimer) clearTimeout(this.authTimer);
        this.authenticated = true;
        this.authFailed = false;
        this.setStatus({
          state: "connected",
          haVersion: typeof message.ha_version === "string" ? message.ha_version : null,
          connectedAt: new Date(),
          errorCode: null,
          errorMessage: null,
          nextRetryAt: null,
          attempt: 0,
        });
        this.log(`connected (Home Assistant ${String(message.ha_version ?? "?")})`);
        void this.afterAuth();
        return;
      case "auth_invalid":
        this.authFailed = true;
        this.setStatus({ errorCode: "auth_invalid", errorMessage: "The access token was rejected" });
        this.drop("auth_invalid", "The access token was rejected");
        return;
      case "result": {
        const pending = this.takePending(message.id);
        if (!pending) return;
        if (message.success) pending.resolve(message.result);
        else {
          const error = (message.error ?? {}) as { code?: string; message?: string };
          pending.reject(new HaCommandError(String(error.code ?? "unknown_error"), String(error.message ?? "Command failed")));
        }
        return;
      }
      case "pong": {
        this.takePending(message.id)?.resolve(null);
        return;
      }
      case "event": {
        const subscription = [...this.subscriptions.values()].find((candidate) => candidate.haId === message.id);
        if (!subscription) return;
        try {
          subscription.handler(message.event as HaEvent);
        } catch (error) {
          console.error("[home-assistant] event handler failed", error);
        }
        return;
      }
      default:
        return;
    }
  }

  private async afterAuth() {
    for (const subscription of this.subscriptions.values()) await this.sendSubscription(subscription);
    this.schedulePing();
    for (const listener of this.connectedListeners) {
      try {
        listener();
      } catch (error) {
        console.error("[home-assistant] connected listener failed", error);
      }
    }
  }

  private async sendSubscription(subscription: Subscription) {
    const id = this.nextId;
    subscription.haId = id;
    try {
      await this.send({ type: "subscribe_events", event_type: subscription.eventType });
    } catch (error) {
      if (subscription.haId === id) subscription.haId = null;
      if (!(error instanceof HaNotConnectedError)) this.log(`subscribe to ${subscription.eventType} failed: ${(error as Error).message}`);
    }
  }

  private send<T>(message: { type: string; [key: string]: unknown }, timeoutMs = this.commandTimeoutMs): Promise<T> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new HaNotConnectedError());
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HaCommandError("timeout", `No answer to ${message.type} within ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        socket.send(JSON.stringify({ ...message, id }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private takePending(id: unknown): Pending | undefined {
    if (typeof id !== "number") return undefined;
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    return pending;
  }

  private schedulePing() {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.pingTimer = setTimeout(() => {
      if (!this.authenticated) return;
      this.send({ type: "ping" }, this.pongTimeoutMs).then(
        () => this.schedulePing(),
        (error: Error) => {
          if (error instanceof HaNotConnectedError) return;
          this.drop("timeout", "No pong from Home Assistant");
        },
      );
    }, this.pingIntervalMs);
    this.pingTimer.unref?.();
  }

  /** Closes the current socket because something is wrong, then schedules a reconnect. */
  private drop(code: HaErrorCode, message: string) {
    const socket = this.socket;
    this.socket = null;
    this.teardown(new HaNotConnectedError());
    socket?.close();
    this.fail(code, message);
  }

  private fail(code: HaErrorCode, message: string) {
    this.setStatus({ state: "error", errorCode: code, errorMessage: message, connectedAt: null });
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoff(this.status.attempt, this.authFailed);
    this.setStatus({ state: "error", nextRetryAt: new Date(Date.now() + delay), attempt: this.status.attempt + 1 });
    this.log(`reconnecting in ${Math.round(delay / 1000)} s (${this.status.errorMessage ?? "connection lost"})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  /** Forgets the current connection: rejects pending commands, clears subscription ids and timers. */
  private teardown(error: Error) {
    this.authenticated = false;
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.authTimer) clearTimeout(this.authTimer);
    this.pingTimer = this.pongTimer = this.authTimer = null;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    for (const subscription of this.subscriptions.values()) subscription.haId = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

/** A command that would disarm: the `alarm_disarm` service (any domain), or an inline script that calls it. */
export function isDisarmCall(message: { type: string; [key: string]: unknown }): boolean {
  if (message.type === "execute_script") return JSON.stringify(message).includes("alarm_disarm");
  return message.type === "call_service" && String(message.service ?? "").toLowerCase() === "alarm_disarm";
}

function describeSocketError(error: Error & { code?: string }): string {
  if (error.code === "ECONNREFUSED") return "Connection refused";
  if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") return "Host not found";
  if (error.code === "ETIMEDOUT") return "Connection timed out";
  if (error.code === "ECONNRESET") return "Connection reset";
  return error.message.slice(0, 200);
}
