import { z } from "zod";

/**
 * Automations: the app's scheduled jobs (src/api/jobs), as the Settings page shows them. Jobs are code;
 * the API lists them with their schedule, state and recent runs, and lets owners and adults pause or run one.
 */

export const JOB_TRIGGERS = ["schedule", "manual", "startup"] as const;
export const jobTriggerSchema = z.enum(JOB_TRIGGERS);
export type JobTrigger = z.infer<typeof jobTriggerSchema>;

export const JOB_RUN_STATUSES = ["running", "succeeded", "failed", "skipped"] as const;
export const jobRunStatusSchema = z.enum(JOB_RUN_STATUSES);
export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;

export const jobRunSchema = z.object({
  id: z.string(),
  trigger: jobTriggerSchema,
  status: jobRunStatusSchema,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  /** Lines the job logged, newline-separated. */
  log: z.string().nullable(),
});
export type JobRun = z.infer<typeof jobRunSchema>;

export const automationJobSchema = z.object({
  /** Code id `<feature>.<name>`, e.g. `waste.sync`. */
  id: z.string(),
  /** i18n keys `namespace:key`, translated with `t(titleKey)`. */
  titleKey: z.string(),
  descriptionKey: z.string(),
  /** 5-field cron expression in `timeZone`. */
  schedule: z.string(),
  timeZone: z.string(),
  enabled: z.boolean(),
  /** Next scheduled run; null while paused. */
  nextRunAt: z.iso.datetime().nullable(),
  /** A run is in progress (in this or another process). */
  running: z.boolean(),
  /** The latest finished run that actually ran (skipped runs only show in the history). */
  lastRun: jobRunSchema.nullable(),
  /**
   * Jobs that don't record idle runs (every-minute checks, `recordIdleRuns: false`): when the server last ran it,
   * also when there was nothing to do. Kept in the server's memory, so `null` right after a restart.
   */
  lastCheckedAt: z.iso.datetime().nullable(),
  /** The most recent runs, newest first, including a running one. */
  recentRuns: z.array(jobRunSchema),
});
export type AutomationJob = z.infer<typeof automationJobSchema>;

export type AutomationsOverview = {
  jobs: AutomationJob[];
  /** Owners and adults may pause and run jobs. */
  canManage: boolean;
};

export const updateAutomationInputSchema = z.object({ enabled: z.boolean() });
export type UpdateAutomationInput = z.infer<typeof updateAutomationInputSchema>;

/** How many runs `recentRuns` holds. */
export const RECENT_RUNS = 10;
