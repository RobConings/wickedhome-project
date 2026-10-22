import type { JobRun as JobRunContract, JobRunStatus, JobTrigger } from "@/features/automations/types/automations";
import { db, type JobRun as JobRunRow } from "../lib/db";
import type { PrunableRun } from "./job-prune";

/**
 * Persistence of the run log and job settings. The runner and scheduler talk to this interface only, so
 * tests can use an in-memory fake.
 */

export type FinishedRun = {
  status: Exclude<JobRunStatus, "running">;
  finishedAt: Date;
  durationMs: number;
  summary?: string | null;
  error?: string | null;
  log?: string | null;
};

export interface JobStore {
  /** Creates a RUNNING run and returns its id. */
  startRun(jobId: string, trigger: JobTrigger, startedAt: Date): Promise<string>;
  finishRun(runId: string, result: FinishedRun): Promise<void>;
  /** Records a run that didn't happen (someone else was running the job). */
  recordSkipped(jobId: string, trigger: JobTrigger, at: Date, reason: string): Promise<void>;
}

const toTrigger = (trigger: JobTrigger) => trigger.toUpperCase() as JobRunRow["trigger"];
const toStatus = (status: JobRunStatus) => status.toUpperCase() as JobRunRow["status"];

export function toJobRun(row: JobRunRow): JobRunContract {
  return {
    id: row.id,
    trigger: row.trigger.toLowerCase() as JobTrigger,
    status: row.status.toLowerCase() as JobRunStatus,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    summary: row.summary,
    error: row.error,
    log: row.log,
  };
}

/** Database columns are text; keep stored messages reasonable. */
const clip = (text: string | null | undefined, max: number) => (text == null ? null : text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const prismaJobStore: JobStore = {
  async startRun(jobId, trigger, startedAt) {
    const row = await db.jobRun.create({ data: { jobId, trigger: toTrigger(trigger), startedAt }, select: { id: true } });
    return row.id;
  },
  async finishRun(runId, result) {
    await db.jobRun.update({
      where: { id: runId },
      data: {
        status: toStatus(result.status),
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        summary: clip(result.summary, 500),
        error: clip(result.error, 2000),
        log: clip(result.log, 20_000),
      },
    });
  },
  async recordSkipped(jobId, trigger, at, reason) {
    await db.jobRun.create({
      data: { jobId, trigger: toTrigger(trigger), status: "SKIPPED", startedAt: at, finishedAt: at, durationMs: 0, error: reason },
    });
  },
};

// Queries for the scheduler and the API ------------------------------------------------------------------

/** Enabled state per job id, for the jobs that have a setting row. */
export async function loadJobSettings(): Promise<Map<string, boolean>> {
  const rows = await db.jobSetting.findMany();
  return new Map(rows.map((row) => [row.jobId, row.enabled]));
}

export async function isJobEnabled(job: { id: string; enabledByDefault: boolean }): Promise<boolean> {
  const row = await db.jobSetting.findUnique({ where: { jobId: job.id } });
  return row?.enabled ?? job.enabledByDefault;
}

export async function saveJobEnabled(jobId: string, enabled: boolean): Promise<void> {
  await db.jobSetting.upsert({ where: { jobId }, create: { jobId, enabled }, update: { enabled } });
}

/** What the catch-up decision needs (see `shouldCatchUp`). */
export async function loadCatchUpInfo(jobId: string): Promise<{ lastSuccessAt: Date | null; lastStartupRunAt: Date | null }> {
  const [success, startup] = await Promise.all([
    db.jobRun.findFirst({ where: { jobId, status: "SUCCEEDED" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    db.jobRun.findFirst({
      where: { jobId, trigger: "STARTUP", status: { not: "SKIPPED" } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);
  return { lastSuccessAt: success?.startedAt ?? null, lastStartupRunAt: startup?.startedAt ?? null };
}

export async function loadRecentRuns(jobId: string, take: number): Promise<JobRunContract[]> {
  const rows = await db.jobRun.findMany({ where: { jobId }, orderBy: { startedAt: "desc" }, take });
  return rows.map(toJobRun);
}

/** The latest finished run that wasn't skipped. */
export async function loadLastRun(jobId: string): Promise<JobRunContract | null> {
  const row = await db.jobRun.findFirst({
    where: { jobId, status: { in: ["SUCCEEDED", "FAILED"] } },
    orderBy: { startedAt: "desc" },
  });
  return row ? toJobRun(row) : null;
}

export async function loadRunningRuns(): Promise<Array<{ id: string; jobId: string; startedAt: Date }>> {
  return db.jobRun.findMany({ where: { status: "RUNNING" }, select: { id: true, jobId: true, startedAt: true } });
}

/** Marks a run left RUNNING (by a crashed or killed process) as failed. */
export async function failAbandonedRun(run: { id: string; startedAt: Date }, now: Date): Promise<void> {
  await db.jobRun.updateMany({
    where: { id: run.id, status: "RUNNING" },
    data: {
      status: "FAILED",
      finishedAt: now,
      durationMs: Math.max(0, now.getTime() - run.startedAt.getTime()),
      error: "Interrupted: the server stopped while this run was in progress",
    },
  });
}

export async function loadPrunableRuns(): Promise<PrunableRun[]> {
  const rows = await db.jobRun.findMany({ select: { id: true, jobId: true, startedAt: true, status: true } });
  return rows.map((row) => ({ ...row, status: row.status.toLowerCase() as JobRunStatus }));
}

export async function deleteRuns(ids: string[]): Promise<number> {
  let deleted = 0;
  for (let index = 0; index < ids.length; index += 1000) {
    const { count } = await db.jobRun.deleteMany({ where: { id: { in: ids.slice(index, index + 1000) } } });
    deleted += count;
  }
  return deleted;
}
