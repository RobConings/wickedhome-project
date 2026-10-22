import type { JobRunStatus } from "@/features/automations/types/automations";

/**
 * Run-log retention. Per job: runs younger than `maxAgeDays` stay, the newest `keepAtLeast` always stay
 * (so a monthly job keeps its history), and never more than `keepAtMost`. Running runs are never pruned.
 */

export type PrunableRun = { id: string; jobId: string; startedAt: Date; status: JobRunStatus };

export type PrunePolicy = { maxAgeDays: number; keepAtLeast: number; keepAtMost: number };

export const DEFAULT_PRUNE_POLICY: PrunePolicy = { maxAgeDays: 90, keepAtLeast: 20, keepAtMost: 500 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ids of the runs to delete. */
export function selectRunsToPrune(runs: PrunableRun[], now: Date, policy: PrunePolicy = DEFAULT_PRUNE_POLICY): string[] {
  const cutoff = now.getTime() - policy.maxAgeDays * DAY_MS;
  const byJob = new Map<string, PrunableRun[]>();
  for (const run of runs) {
    if (run.status === "running") continue;
    const list = byJob.get(run.jobId) ?? [];
    list.push(run);
    byJob.set(run.jobId, list);
  }

  const doomed: string[] = [];
  for (const list of byJob.values()) {
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    list.forEach((run, index) => {
      if (index < policy.keepAtLeast) return;
      if (index >= policy.keepAtMost || run.startedAt.getTime() < cutoff) doomed.push(run.id);
    });
  }
  return doomed;
}
