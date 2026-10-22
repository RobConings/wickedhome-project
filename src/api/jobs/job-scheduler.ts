import { Cron } from "croner";
import { conflict, notFound } from "../lib/http";
import { advisoryLock, closeLockPool } from "./job-lock";
import { getJob, listJobs, type RegisteredJob } from "./job-registry";
import { createJobRunner, type RunOutcome } from "./job-runner";
import { JOB_TIME_ZONE, shouldCatchUp } from "./job-schedule";
import { failAbandonedRun, isJobEnabled, loadCatchUpInfo, loadRunningRuns, prismaJobStore } from "./job-store";

/**
 * The in-process scheduler. Started by server.ts once the app listens (development and production alike),
 * stopped on SIGINT/SIGTERM. Each job gets a croner timer in Europe/Brussels; when it fires, the job runs
 * through the runner (lock, run log, timeout) unless it is paused. See docs/AUTOMATIONS.md.
 */

/** Catch-up runs wait a little, so they never slow down startup. */
const CATCH_UP_DELAY_MS = 20_000;
/** pm2 kills the process 1.6 s after SIGINT; give running jobs a moment to record that they were stopped. */
const SHUTDOWN_GRACE_MS = 1_000;

export const jobRunner = createJobRunner({ store: prismaJobStore, lock: advisoryLock });

type SchedulerState = { timers: Cron[]; catchUp: ReturnType<typeof setTimeout> | null };
let state: SchedulerState | null = null;

async function runScheduled(job: RegisteredJob): Promise<void> {
  try {
    if (!(await isJobEnabled(job))) return;
  } catch (error) {
    console.error(`[jobs] ${job.id}: could not read its settings; skipping this run`, error);
    return;
  }
  await jobRunner.run(job, "schedule");
}

/** Runs left RUNNING by a crash: failed, unless another process still holds the job's lock (really running). */
async function failAbandonedRuns(): Promise<void> {
  const runs = await loadRunningRuns();
  for (const run of runs) {
    const release = await advisoryLock.tryAcquire(run.jobId);
    if (!release) continue;
    try {
      await failAbandonedRun(run, new Date());
      console.log(`[jobs] ${run.jobId}: marked an interrupted run as failed`);
    } finally {
      await release();
    }
  }
}

async function catchUp(): Promise<void> {
  for (const job of listJobs()) {
    if (!state) return;
    if (!job.runOnStartupIfMissed) continue;
    try {
      if (!(await isJobEnabled(job))) continue;
      const info = await loadCatchUpInfo(job.id);
      if (!shouldCatchUp({ schedule: job.schedule, now: new Date(), ...info })) continue;
      console.log(`[jobs] ${job.id}: a scheduled run was missed; running it now`);
      // One at a time: catch-ups are background work, not a stampede.
      await jobRunner.run(job, "startup");
    } catch (error) {
      console.error(`[jobs] ${job.id}: catch-up check failed`, error);
    }
  }
}

/** Starts the scheduler. Idempotent; never throws (a broken job table must not stop the app). */
export async function startScheduler(): Promise<void> {
  if (state) return;
  const current: SchedulerState = { timers: [], catchUp: null };
  state = current;

  try {
    await failAbandonedRuns();
  } catch (error) {
    console.error("[jobs] could not check for interrupted runs", error);
  }

  for (const job of listJobs()) {
    const timer = new Cron(job.schedule, { timezone: JOB_TIME_ZONE, name: `job:${job.id}` }, () => {
      void runScheduled(job);
    });
    current.timers.push(timer);
  }
  current.catchUp = setTimeout(() => void catchUp(), CATCH_UP_DELAY_MS);
  current.catchUp.unref();
  console.log(`[jobs] scheduler started: ${current.timers.length} jobs (${JOB_TIME_ZONE})`);
}

/** Stops the timers, aborts running jobs and waits briefly for them to record that. */
export async function stopScheduler(): Promise<void> {
  const current = state;
  state = null;
  if (current) {
    for (const timer of current.timers) timer.stop();
    if (current.catchUp) clearTimeout(current.catchUp);
  }
  jobRunner.abortAll("Stopped: the server shut down during this run");
  await jobRunner.idle(SHUTDOWN_GRACE_MS);
  await closeLockPool();
}

/**
 * "Run now" from the app: starts the job in the background and returns at once. Allowed for paused jobs.
 * A job already running in this process is a 409; one running elsewhere is recorded as skipped.
 */
export function startJobNow(jobId: string): void {
  const job = getJob(jobId);
  if (!job) throw notFound("Job not found");
  if (jobRunner.isRunning(job.id)) throw conflict("This job is already running");
  void jobRunner.run(job, "manual");
}

/** Runs a job and waits for the outcome (the `npm run job` command line). */
export async function runJobToCompletion(jobId: string): Promise<RunOutcome> {
  const job = getJob(jobId);
  if (!job) throw notFound(`Job "${jobId}" not found`);
  return jobRunner.run(job, "manual");
}
