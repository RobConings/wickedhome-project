import { Cron } from "croner";
import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";

/**
 * Schedule maths for jobs: 5-field cron expressions (minute hour day-of-month month day-of-week), always
 * evaluated in the household time zone, so "15 5 * * *" is 05:15 in Brussels in summer and winter alike.
 *
 * DST (Europe/Brussels), as croner handles it:
 * - spring forward (last Sunday of March, 02:00 → 03:00): a time inside the missing hour (02:30) runs once
 *   at the same offset after the jump (03:30);
 * - fall back (last Sunday of October, 03:00 → 02:00): a time inside the repeated hour runs once, not twice.
 */

export const JOB_TIME_ZONE = HOUSEHOLD_TIME_ZONE;

const cronFor = (schedule: string) => new Cron(schedule, { timezone: JOB_TIME_ZONE, paused: true });

/** Throws a readable error when `schedule` is not a valid 5-field cron expression. */
export function assertValidSchedule(schedule: string): void {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Job schedule "${schedule}" must have 5 fields (minute hour day month weekday)`);
  try {
    cronFor(schedule);
  } catch (error) {
    throw new Error(`Job schedule "${schedule}" is invalid: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** The first scheduled time strictly after `after`, or null if the schedule never fires again. */
export function nextRunAfter(schedule: string, after: Date): Date | null {
  return cronFor(schedule).nextRun(after) ?? null;
}

export type CatchUpInput = {
  schedule: string;
  now: Date;
  /** Start of the last successful run, any trigger. */
  lastSuccessAt: Date | null;
  /** Start of the last run started by a catch-up at startup, whatever its outcome. */
  lastStartupRunAt: Date | null;
};

/**
 * Should a job with `runOnStartupIfMissed` run once now, at startup? Yes when a scheduled time passed
 * since its last successful run (or it never succeeded). But at most one catch-up per missed time: when a
 * catch-up already ran after that time (and failed), another restart doesn't retry it. That matters in
 * development, where every saved file restarts the server.
 */
export function shouldCatchUp({ schedule, now, lastSuccessAt, lastStartupRunAt }: CatchUpInput): boolean {
  if (lastSuccessAt) {
    const due = nextRunAfter(schedule, lastSuccessAt);
    if (!due || due > now) return false;
  }
  if (lastStartupRunAt) {
    // No scheduled time passed since the last catch-up attempt: it already covered this one.
    const due = nextRunAfter(schedule, lastStartupRunAt);
    if (!due || due > now) return false;
  }
  return true;
}
