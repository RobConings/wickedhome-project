import { ModelError, type ChatModel, type ChatRequest } from "./llm-client";

/**
 * One model server, one request at a time: every call to the model (chats, the mail scan) waits its turn
 * here instead of at the server. A single GPU can't run two prompts faster than one after the other, and two
 * at once can run it out of memory (LM Studio's engine crashed, 2026-10-09). Here:
 *
 * - chats go before background work (the mail scan reads a bill between two chat steps, never before one);
 * - the time in the queue doesn't count towards the model's timeouts (they start when the call does);
 * - a call that dies because the engine went away (crash, reload) waits a moment and is tried once more,
 *   unless text was already streamed.
 *
 *   const model = queuedModel(createOpenAiChatModel(settings), { priority: "chat", onStatus });
 *
 * In-process: the app runs as one Node process (pm2), so this sees every model call it makes.
 */

export type ModelPriority = "chat" | "background";

/** What the person may see while a call waits: in the queue, or the model server restarting. */
export type ModelQueueStatus = "queued" | "restarting" | null;

type Waiter = { priority: ModelPriority; start: () => void };

/** How many calls may run at once (LM Studio "Max Concurrent Predictions"); 1 unless set. */
let limit = 1;
let running = 0;
const waiting: Waiter[] = [];

export function setModelConcurrency(value: number): void {
  limit = Math.max(1, Math.floor(value));
  next();
}

/** Calls running and waiting (tests, logs). */
export const modelQueueState = () => ({ running, waiting: waiting.length, limit });

function next(): void {
  while (running < limit && waiting.length) {
    // Chats first, then in order of arrival.
    const index = waiting.findIndex((waiter) => waiter.priority === "chat");
    const [waiter] = waiting.splice(index >= 0 ? index : 0, 1);
    running += 1;
    waiter?.start();
  }
}

/** Waits for a turn; resolves with the function that gives it back. Rejects when `signal` aborts first. */
export function acquireModelSlot(priority: ModelPriority, signal: AbortSignal, onQueued?: () => void): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      running -= 1;
      next();
    };
    const waiter: Waiter = {
      priority,
      start: () => {
        signal.removeEventListener("abort", onAbort);
        resolve(release);
      },
    };
    const onAbort = () => {
      const index = waiting.indexOf(waiter);
      if (index >= 0) waiting.splice(index, 1);
      reject(new ModelError("aborted", "Stopped"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    waiting.push(waiter);
    next();
    if (waiting.includes(waiter)) onQueued?.();
  });
}

/**
 * The engine went away mid-call: LM Studio's "Engine protocol predict request failed: fetch failed" (its own
 * engine crashed or is reloading), or the server itself didn't answer. Not a refused request (HTTP 4xx/5xx
 * with a reason, a bad schema): trying again would only fail again.
 */
export function isEngineGone(error: unknown): boolean {
  if (!(error instanceof ModelError)) return false;
  if (error.code === "unreachable") return true;
  return error.code === "http" && error.status === null && /fetch failed|ECONNRESET|socket hang up|terminated/i.test(error.message) && !/returned \d{3}/.test(error.message);
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new ModelError("aborted", "Stopped"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ModelError("aborted", "Stopped"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

export type QueuedModelOptions = {
  priority: ModelPriority;
  /** Shown to the person: waiting in the queue, the server restarting, or `null` once the call runs. */
  onStatus?: (status: ModelQueueStatus) => void;
  /** Before the one retry: LM Studio restarts a crashed engine and loads the model again (JIT). */
  retryDelayMs?: number;
};

/** `model` behind the queue, with one retry when the engine went away before any text came. */
export function queuedModel(model: ChatModel, options: QueuedModelOptions): ChatModel {
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  return async (request: ChatRequest) => {
    let queued = false;
    const release = await acquireModelSlot(options.priority, request.signal, () => {
      queued = true;
      options.onStatus?.("queued");
    });
    if (queued) options.onStatus?.(null);
    try {
      let streamed = false;
      const attempt = () =>
        model({
          ...request,
          ...(request.onText && {
            onText: (text: string) => {
              streamed = true;
              request.onText?.(text);
            },
          }),
        });
      try {
        return await attempt();
      } catch (error) {
        if (streamed || request.signal.aborted || !isEngineGone(error)) throw error;
        console.warn(`[assistant] model engine went away (${(error as Error).message}); trying once more in ${retryDelayMs / 1000} s`);
        options.onStatus?.("restarting");
        try {
          await sleep(retryDelayMs, request.signal);
        } finally {
          options.onStatus?.(null);
        }
        return await attempt();
      }
    } finally {
      release();
    }
  };
}
