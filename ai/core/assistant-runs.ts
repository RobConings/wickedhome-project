import type { AssistantStreamEvent } from "@/features/assistant/types/assistant";
import { HttpError, conflict } from "@/api/lib/http";

/**
 * Answers that keep running when the browser goes away. A question (or a confirmation) starts a run; the
 * request that started it only *watches* it, like any later `GET …/stream`. Leaving the page, a phone
 * locking its screen or a dropped connection no longer stops the model: the answer is stored as usual and a
 * returning chat attaches again and gets every event of the run so far (then the rest, live). Only Stop
 * (`POST …/stop`) ends a run early.
 *
 * One run per conversation at a time (and per person for a new conversation until it has its id): that is
 * also the lock that keeps two windows from interleaving a turn. Runs live in this process's memory; a
 * finished run is kept a minute so a chat that attaches just after the end still sees how it ended.
 */

type Listener = (event: AssistantStreamEvent) => void;

const KEEP_FINISHED_MS = 60_000;

export class AssistantRun {
  readonly controller = new AbortController();
  /** Every event so far (consecutive text pieces joined), replayed to a chat that attaches. */
  readonly events: AssistantStreamEvent[] = [];
  /** Messages stored by this run: left out of the conversation's detail while it runs (the replay shows them). */
  readonly savedIds = new Set<string>();
  finished = false;
  private readonly listeners = new Set<Listener>();

  constructor(readonly userId: string) {}

  push(event: AssistantStreamEvent): void {
    const last = this.events[this.events.length - 1];
    if (event.type === "text" && last?.type === "text") this.events[this.events.length - 1] = { type: "text", text: last.text + event.text };
    else this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  /** Replays the events so far, then passes on new ones until unsubscribed. */
  subscribe(listener: Listener): () => void {
    for (const event of this.events) listener(event);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Key: the conversation id, or `new:<userId>` until a new conversation has one (its `start` event). */
const runs = new Map<string, AssistantRun>();

/** The run of this conversation (running, or finished less than a minute ago), when it is this person's. */
export function findRun(conversationId: string, userId: string): AssistantRun | null {
  const run = runs.get(conversationId);
  return run && run.userId === userId ? run : null;
}

export const isRunning = (run: AssistantRun | null): run is AssistantRun => Boolean(run && !run.finished);

/**
 * Starts `work` as a run under `key`. Resolves with the run once its first event is out (then watch it with
 * `subscribe`); an error before that (not configured, not found, invalid input) rejects, so the route can
 * answer it as a normal HTTP error. Later errors become an `error` event followed by `done`.
 */
export function startRun(key: string, userId: string, work: (run: AssistantRun) => Promise<void>): Promise<AssistantRun> {
  if (isRunning(runs.get(key) ?? null)) throw conflict("The assistant is still answering");
  const run = new AssistantRun(userId);
  runs.set(key, run);
  let currentKey = key;
  return new Promise((resolve, reject) => {
    let started = false;
    const push = run.push.bind(run);
    run.push = (event) => {
      // A new conversation: from now on it is found under its id.
      if (event.type === "start" && currentKey !== event.conversationId) {
        if (runs.get(currentKey) === run) runs.delete(currentKey);
        currentKey = event.conversationId;
        runs.set(currentKey, run);
      }
      push(event);
      if (!started) {
        started = true;
        resolve(run);
      }
    };
    void (async () => {
      try {
        await work(run);
      } catch (error) {
        if (!started) {
          reject(error);
        } else {
          console.error("Assistant run failed", error);
          run.push({ type: "error", code: error instanceof HttpError ? error.code : "internal", message: error instanceof HttpError ? error.message : "Something went wrong" });
          run.push({ type: "done", status: "error" });
        }
      } finally {
        run.finished = true;
        if (!started) {
          if (runs.get(currentKey) === run) runs.delete(currentKey);
          reject(new Error("The answer ended before it started"));
        } else {
          setTimeout(() => {
            if (runs.get(currentKey) === run) runs.delete(currentKey);
          }, KEEP_FINISHED_MS).unref();
        }
      }
    })();
  });
}
