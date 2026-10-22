import { assertValidSchedule } from "./job-schedule";

/**
 * The job registry: every scheduled job of the app, registered by the feature that owns it. Registering
 * only describes the job; the scheduler (job-scheduler.ts) runs it. See docs/AUTOMATIONS.md.
 *
 *   // src/api/<feature>/<feature>.jobs.ts, imported by <feature>.routes.ts
 *   registerJob({
 *     id: "waste.sync",
 *     schedule: "15 5 * * *",                    // every day at 05:15, Europe/Brussels
 *     titleKey: "waste:jobs.sync.title",
 *     descriptionKey: "waste:jobs.sync.description",
 *     runOnStartupIfMissed: true,
 *     run: async ({ signal, log }) => {
 *       const { summary, failed } = await syncAllWasteSetups({ signal, log });
 *       if (failed > 0) throw new Error(summary);     // a failed run shows in Settings → Automations
 *       return { summary };
 *     },
 *   });
 */

export type JobTrigger = "schedule" | "manual" | "startup";

export type JobContext = {
  /** Aborted on timeout and when the server shuts down: pass it to fetch() and check it in loops. */
  signal: AbortSignal;
  /** Why this run started. */
  trigger: JobTrigger;
  /** Adds a line to the run log (shown in the app) and to the server console. */
  log: (message: string) => void;
};

/**
 * `void` so a job without a summary can simply return nothing. `idle`: the run found nothing to do (e.g. no
 * reminder due); with `recordIdleRuns: false` such a run leaves no trace (see there).
 */
export type JobResult = { summary?: string; idle?: boolean } | void;

export type JobDefinition = {
  /** Stable code id `<feature>.<name>`, e.g. `waste.sync`. Run history and settings are keyed on it. */
  id: string;
  /** 5-field cron expression, evaluated in Europe/Brussels (DST-safe), e.g. `"15 5 * * *"`. */
  schedule: string;
  /** i18n key `namespace:key` of the title, provided by the owning feature's locales. */
  titleKey: string;
  /** i18n key `namespace:key` of a one-line description. */
  descriptionKey: string;
  /** Run once shortly after startup when a scheduled time was missed (server down). Default false. */
  runOnStartupIfMissed?: boolean;
  /** Abort the run after this many ms. Default 10 minutes. */
  timeoutMs?: number;
  /** Whether the job runs before anyone changes it in the app. Default true. */
  enabledByDefault?: boolean;
  /**
   * Default true. False for frequent jobs that mostly find nothing to do (every minute): a scheduled run that
   * returns `{ idle: true }` then writes no run row and no console line; only its time is kept in memory and
   * shown as "Last check" in Automations (`lastCheckedAt`). Runs that did something, failed, or were started by
   * hand are recorded as usual, so "Last run" is the last real one.
   */
  recordIdleRuns?: boolean;
  /** The work. Throwing (or rejecting) marks the run failed; it never crashes the process. */
  run: (ctx: JobContext) => Promise<JobResult> | JobResult;
};

export type RegisteredJob = Required<JobDefinition>;

export const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const JOB_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const I18N_KEY = /^[a-z][a-z0-9-]*:[A-Za-z0-9_.-]+$/;

const jobs = new Map<string, RegisteredJob>();

/** Registers a job. Throws on a duplicate id, a malformed id or i18n key, or an invalid schedule. */
export function registerJob(definition: JobDefinition): RegisteredJob {
  const { id } = definition;
  if (!JOB_ID.test(id)) throw new Error(`Job id "${id}" must look like "<feature>.<name>" (lowercase)`);
  if (jobs.has(id)) throw new Error(`Job "${id}" is already registered`);
  for (const key of [definition.titleKey, definition.descriptionKey]) {
    if (!I18N_KEY.test(key)) throw new Error(`Job "${id}": "${key}" must be an i18n key "namespace:key"`);
  }
  const schedule = definition.schedule.trim().replace(/\s+/g, " ");
  assertValidSchedule(schedule);
  const timeoutMs = definition.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`Job "${id}": timeoutMs must be positive`);

  const job: RegisteredJob = {
    ...definition,
    schedule,
    runOnStartupIfMissed: definition.runOnStartupIfMissed ?? false,
    timeoutMs,
    enabledByDefault: definition.enabledByDefault ?? true,
    recordIdleRuns: definition.recordIdleRuns ?? true,
  };
  jobs.set(id, job);
  return job;
}

export const getJob = (id: string): RegisteredJob | undefined => jobs.get(id);

/** Every registered job, sorted by id. */
export const listJobs = (): RegisteredJob[] => [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id));

/** Tests only: forget a job. */
export const unregisterJob = (id: string) => jobs.delete(id);
