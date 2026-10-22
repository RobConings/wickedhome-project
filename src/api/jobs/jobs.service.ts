import { RECENT_RUNS, type AutomationJob, type JobRun } from "@/features/automations/types/automations";
import { notFound } from "../lib/http";
import { getJob, listJobs, type RegisteredJob } from "./job-registry";
import { JOB_TIME_ZONE, nextRunAfter } from "./job-schedule";
import { jobRunner } from "./job-scheduler";
import { isJobEnabled, loadJobSettings, loadLastRun, loadRecentRuns, saveJobEnabled } from "./job-store";

/** The jobs as the app shows them: definition, state, next run and recent runs. */

async function toAutomationJob(job: RegisteredJob, enabled: boolean, now: Date): Promise<AutomationJob> {
  const [recentRuns, lastRun] = await Promise.all([loadRecentRuns(job.id, RECENT_RUNS), loadLastRun(job.id)]);
  const running = jobRunner.isRunning(job.id) || recentRuns.some((run: JobRun) => run.status === "running");
  return {
    id: job.id,
    titleKey: job.titleKey,
    descriptionKey: job.descriptionKey,
    schedule: job.schedule,
    timeZone: JOB_TIME_ZONE,
    enabled,
    nextRunAt: enabled ? (nextRunAfter(job.schedule, now)?.toISOString() ?? null) : null,
    running,
    lastRun,
    lastCheckedAt: job.recordIdleRuns ? null : (jobRunner.lastCheckedAt(job.id)?.toISOString() ?? null),
    recentRuns,
  };
}

export async function listAutomations(): Promise<AutomationJob[]> {
  const settings = await loadJobSettings();
  const now = new Date();
  return Promise.all(listJobs().map((job) => toAutomationJob(job, settings.get(job.id) ?? job.enabledByDefault, now)));
}

function findJob(id: string): RegisteredJob {
  const job = getJob(id);
  if (!job) throw notFound("Job not found");
  return job;
}

export async function getAutomation(id: string): Promise<AutomationJob> {
  const job = findJob(id);
  return toAutomationJob(job, await isJobEnabled(job), new Date());
}

export async function listAutomationRuns(id: string, take: number): Promise<JobRun[]> {
  return loadRecentRuns(findJob(id).id, take);
}

/** Pauses or resumes the schedule. A run in progress is not interrupted. */
export async function setAutomationEnabled(id: string, enabled: boolean): Promise<AutomationJob> {
  const job = findJob(id);
  await saveJobEnabled(job.id, enabled);
  return toAutomationJob(job, enabled, new Date());
}
