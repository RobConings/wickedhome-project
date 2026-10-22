import type { JobRunStatus } from "@/features/automations/types/automations";
import type { JobLock } from "./job-lock";
import type { JobTrigger, RegisteredJob } from "./job-registry";
import type { JobStore } from "./job-store";

/**
 * Runs one job once: takes the job's lock, records the run, enforces the timeout through the AbortSignal
 * and records the outcome. Never throws: a failing job (or a failing database) is logged, not fatal.
 *
 * Jobs with `recordIdleRuns: false` (every-minute jobs): a scheduled run is only written (and logged to the
 * console) once it turns out to have done something; an idle run only updates `lastCheckedAt`.
 */

export type RunOutcome = {
  status: Exclude<JobRunStatus, "running">;
  summary?: string;
  error?: string;
  /** The job found nothing to do (it returned `idle: true`). */
  idle?: boolean;
};

export type JobRunnerOptions = {
  store: JobStore;
  lock: JobLock;
  /** After an abort (timeout, shutdown), how long a job may take to stop before its run is closed anyway. */
  abortGraceMs?: number;
  now?: () => Date;
  /** Console output; tests silence it. */
  logger?: Pick<Console, "log" | "error">;
};

const MAX_LOG_LINES = 200;

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)) || "Unknown error";

export class JobAbortedError extends Error {
  override name = "JobAbortedError";
}

const minutes = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 100) / 10} s`);

export type JobRunner = ReturnType<typeof createJobRunner>;

export function createJobRunner({ store, lock, abortGraceMs = 5_000, now = () => new Date(), logger = console }: JobRunnerOptions) {
  /** Jobs running in this process, with the controller that aborts them. */
  const running = new Map<string, AbortController>();
  /** When each job last finished a run in this process, recorded or not ("Last check"). */
  const lastChecked = new Map<string, Date>();
  const settled = new Set<() => void>();

  const notifySettled = () => {
    for (const resolve of settled) resolve();
  };

  /** Resolves with the job's result, or rejects once the signal aborted and the grace period passed. */
  function untilDoneOrAbandoned<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        graceTimer = setTimeout(() => reject(signal.reason), abortGraceMs);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
      work.then(resolve, reject).finally(() => {
        clearTimeout(graceTimer);
        signal.removeEventListener("abort", onAbort);
      });
    });
  }

  async function execute(job: RegisteredJob, trigger: JobTrigger, controller: AbortController): Promise<RunOutcome> {
    const startedAt = now();
    // Quiet: the run row and console lines wait until we know the run did something (manual runs always show).
    const quiet = !job.recordIdleRuns && trigger !== "manual";
    let runId = quiet ? null : await store.startRun(job.id, trigger, startedAt);
    const lines: string[] = [];
    const held: string[] = [];
    const log = (message: string) => {
      if (quiet) held.push(message);
      else logger.log(`[jobs] ${job.id}: ${message}`);
      if (lines.length < MAX_LOG_LINES) lines.push(`${now().toISOString().slice(11, 19)} ${message}`);
      else if (lines.length === MAX_LOG_LINES) lines.push("… (more lines not kept)");
    };

    const timeout = setTimeout(
      () => controller.abort(new JobAbortedError(`Timed out after ${minutes(job.timeoutMs)}`)),
      job.timeoutMs,
    );
    let outcome: RunOutcome;
    try {
      const work = Promise.resolve().then(() => job.run({ signal: controller.signal, trigger, log }));
      const result = await untilDoneOrAbandoned(work, controller.signal);
      const summary = typeof result === "object" && result !== null ? result.summary : undefined;
      const idle = typeof result === "object" && result !== null && result.idle === true;
      outcome = { status: "succeeded", summary, ...(idle && { idle }) };
    } catch (error) {
      // A job that rejects because of our abort gets the abort's reason, not a generic "This operation was aborted".
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      outcome = { status: "failed", error: errorMessage(reason) };
    } finally {
      clearTimeout(timeout);
    }

    const finishedAt = now();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    lastChecked.set(job.id, finishedAt);
    if (quiet && outcome.status === "succeeded" && outcome.idle && held.length === 0) return outcome;
    for (const message of held) logger.log(`[jobs] ${job.id}: ${message}`);
    if (runId === null) {
      const started = await store.startRun(job.id, trigger, startedAt).catch((error: unknown) => {
        logger.error(`[jobs] ${job.id}: could not record the run`, error);
        return null;
      });
      if (started === null) return outcome;
      runId = started;
    }
    await store
      .finishRun(runId, {
        status: outcome.status,
        finishedAt,
        durationMs,
        summary: outcome.summary ?? null,
        error: outcome.error ?? null,
        log: lines.length ? lines.join("\n") : null,
      })
      .catch((error: unknown) => logger.error(`[jobs] ${job.id}: could not record the run`, error));
    const detail = outcome.error ?? outcome.summary;
    logger.log(`[jobs] ${job.id} ${outcome.status} in ${durationMs} ms (${trigger})${detail ? `: ${detail}` : ""}`);
    return outcome;
  }

  async function skip(job: RegisteredJob, trigger: JobTrigger, reason: string): Promise<RunOutcome> {
    logger.log(`[jobs] ${job.id} skipped (${trigger}): ${reason}`);
    await store
      .recordSkipped(job.id, trigger, now(), reason)
      .catch((error: unknown) => logger.error(`[jobs] ${job.id}: could not record the skipped run`, error));
    return { status: "skipped", error: reason };
  }

  return {
    /** Runs the job unless it is already running (here or in another process): then the run is skipped. */
    async run(job: RegisteredJob, trigger: JobTrigger): Promise<RunOutcome> {
      // Checked and set synchronously, so two triggers in the same tick can't both pass.
      if (running.has(job.id)) return skip(job, trigger, "Already running");
      const controller = new AbortController();
      running.set(job.id, controller);
      try {
        const release = await lock.tryAcquire(job.id);
        if (!release) return await skip(job, trigger, "Already running in another process");
        try {
          return await execute(job, trigger, controller);
        } finally {
          await release();
        }
      } catch (error) {
        logger.error(`[jobs] ${job.id}: run failed before it started`, error);
        return { status: "failed", error: errorMessage(error) };
      } finally {
        running.delete(job.id);
        notifySettled();
      }
    },

    isRunning: (jobId: string) => running.has(jobId),

    /** When the job last finished a run in this process (also idle runs that weren't recorded), or `null`. */
    lastCheckedAt: (jobId: string): Date | null => lastChecked.get(jobId) ?? null,

    /** Aborts every run in this process (shutdown). */
    abortAll(reason: string) {
      for (const controller of running.values()) controller.abort(new JobAbortedError(reason));
    },

    /** Resolves when nothing runs any more, or after `timeoutMs`. */
    async idle(timeoutMs: number): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (running.size > 0 && Date.now() < deadline) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, Math.max(0, deadline - Date.now()));
          function done() {
            clearTimeout(timer);
            settled.delete(done);
            resolve();
          }
          settled.add(done);
        });
      }
    },
  };
}
