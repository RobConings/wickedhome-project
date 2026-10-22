import type { AutomationsClient } from "@/features/automations";
import type { AutomationJob, AutomationsOverview, JobRun } from "@/features/automations/types/automations";

/** Times relative to when Storybook loads, so "3 hours ago" reads naturally. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let runSequence = 0;
const run = (offsetMs: number, overrides: Partial<JobRun> = {}): JobRun => {
  const startedAt = at(offsetMs);
  const durationMs = overrides.durationMs ?? 1_840;
  return {
    id: `run-${(runSequence += 1)}`,
    trigger: "schedule",
    status: "succeeded",
    startedAt,
    finishedAt: new Date(new Date(startedAt).getTime() + durationMs).toISOString(),
    durationMs,
    summary: null,
    error: null,
    log: null,
    ...overrides,
  };
};

const job = (overrides: Partial<AutomationJob> & Pick<AutomationJob, "id" | "titleKey" | "descriptionKey" | "schedule">): AutomationJob => {
  const recentRuns = overrides.recentRuns ?? [];
  return {
    timeZone: "Europe/Brussels",
    enabled: true,
    nextRunAt: at(14 * HOUR),
    running: false,
    lastRun: recentRuns.find((item) => item.status === "succeeded" || item.status === "failed") ?? null,
    lastCheckedAt: null,
    ...overrides,
    recentRuns,
  };
};

const daily = (days: number, summary: string, extra: Partial<JobRun> = {}) =>
  Array.from({ length: days }, (_, index) => run(-(index * 24 + 5) * HOUR, { summary, ...extra }));

export const wasteSyncJob = job({
  id: "waste.sync",
  titleKey: "waste:jobs.sync.title",
  descriptionKey: "waste:jobs.sync.description",
  schedule: "15 5 * * *",
  recentRuns: [
    run(-3 * HOUR, { trigger: "manual", summary: "1 calendar synced: 42 collections", durationMs: 2_310, log: "05:15:01 Limburg.net: 42 collections\n05:15:03 1 setup synced" }),
    ...daily(4, "1 calendar synced: 42 collections"),
  ],
});

export const shopIconsJob = job({
  id: "shops.icons",
  titleKey: "shops:jobs.icons.title",
  descriptionKey: "shops:jobs.icons.description",
  schedule: "20 4 * * *",
  nextRunAt: at(13 * HOUR),
  recentRuns: daily(3, "2 of 3 icons fetched", { durationMs: 8_400 }),
});

export const abandonedUploadsJob = job({
  id: "documents.abandoned-uploads",
  titleKey: "documents:jobs.abandonedUploads.title",
  descriptionKey: "documents:jobs.abandonedUploads.description",
  schedule: "50 4 * * *",
  nextRunAt: at(13.5 * HOUR),
  recentRuns: [run(-6 * HOUR, { summary: "Nothing to clean up", durationMs: 31 }), run(-30 * HOUR, { trigger: "startup", summary: "2 unfinished uploads removed", durationMs: 44 })],
});

export const pruneRunsJob = job({
  id: "jobs.prune-runs",
  titleKey: "automations:jobs.pruneRuns.title",
  descriptionKey: "automations:jobs.pruneRuns.description",
  schedule: "40 3 * * *",
  nextRunAt: at(12 * HOUR),
  recentRuns: [run(-7 * HOUR, { summary: "0 old runs removed", durationMs: 12 })],
});

/** Every minute, idle runs not recorded: "Last run" is the last real one, "Last check" a few seconds ago. */
export const remindersJob = job({
  id: "tasks.reminders",
  titleKey: "tasks:jobs.reminders.title",
  descriptionKey: "tasks:jobs.reminders.description",
  schedule: "* * * * *",
  nextRunAt: at(40_000),
  lastCheckedAt: at(-20_000),
  recentRuns: [run(-2 * HOUR, { summary: "1 reminder sent", durationMs: 140 }), run(-26 * HOUR, { summary: "2 reminders sent", durationMs: 180 })],
});

export const neverRunJob = job({
  id: "energy.weekly-report",
  titleKey: "automations:jobs.pruneRuns.title",
  descriptionKey: "automations:jobs.pruneRuns.description",
  schedule: "0 7 * * 1",
  nextRunAt: at(3 * 24 * HOUR),
});

export const automationsFixture: AutomationsOverview = {
  canManage: true,
  jobs: [abandonedUploadsJob, pruneRunsJob, shopIconsJob, wasteSyncJob],
};

/** The waste sync is running right now (started by hand a few seconds ago). */
export const runningAutomationsFixture: AutomationsOverview = {
  ...automationsFixture,
  jobs: automationsFixture.jobs.map((item) =>
    item.id === wasteSyncJob.id
      ? { ...item, running: true, recentRuns: [run(-5_000, { trigger: "manual", status: "running", finishedAt: null, durationMs: null }), ...item.recentRuns] }
      : item,
  ),
};

const failedRun = run(-2 * HOUR, {
  status: "failed",
  durationMs: 30_012,
  error: "Limburg.net didn't answer within 30 s (HTTP 504)",
  log: "05:15:00 Fetching collections for Kempische Steenweg 100, Hasselt\n05:15:30 Request timed out",
});

/** The last waste sync failed; the one before that worked. */
export const failedAutomationsFixture: AutomationsOverview = {
  ...automationsFixture,
  jobs: automationsFixture.jobs.map((item) =>
    item.id === wasteSyncJob.id ? { ...item, lastRun: failedRun, recentRuns: [failedRun, run(-26 * HOUR, { status: "skipped", durationMs: 0, error: "Already running in another process" }), ...item.recentRuns] } : item,
  ),
};

/** The shop icon retry is paused: no next run. */
export const pausedAutomationsFixture: AutomationsOverview = {
  ...automationsFixture,
  jobs: automationsFixture.jobs.map((item) => (item.id === shopIconsJob.id ? { ...item, enabled: false, nextRunAt: null } : item)),
};

export const emptyAutomationsFixture: AutomationsOverview = { canManage: true, jobs: [] };

/**
 * A pretend API: pausing works, "Run now" runs for `runMs` and then succeeds (or fails with `failWith`).
 * `runMs: Infinity` keeps it running; `listDelayMs: Infinity` keeps the section loading.
 */
export function fakeAutomationsClient(
  overview: AutomationsOverview,
  { runMs = 3_000, failWith, listDelayMs = 0 }: { runMs?: number; failWith?: string; listDelayMs?: number } = {},
): AutomationsClient {
  const jobs = new Map(overview.jobs.map((item) => [item.id, item]));
  const finishAt = new Map<string, number>();
  const find = (id: string) => {
    const found = jobs.get(id);
    if (!found) throw new Error("Job not found");
    return found;
  };
  const wait = (ms: number) => new Promise<void>((resolve) => (Number.isFinite(ms) ? setTimeout(resolve, ms) : undefined));

  return {
    list: async () => {
      await wait(listDelayMs);
      return { ...overview, jobs: [...jobs.values()] };
    },
    get: async (id) => {
      const current = find(id);
      const end = finishAt.get(id);
      if (!current.running || end === undefined || Date.now() < end) return current;
      finishAt.delete(id);
      const done = run(0, {
        trigger: "manual",
        status: failWith ? "failed" : "succeeded",
        durationMs: Number.isFinite(runMs) ? runMs : 0,
        error: failWith ?? null,
        summary: failWith ? null : "Done",
      });
      const updated = { ...current, running: false, lastRun: done, recentRuns: [done, ...current.recentRuns.filter((item) => item.status !== "running")] };
      jobs.set(id, updated);
      return updated;
    },
    run: async (id) => {
      await wait(400);
      const started = { ...find(id), running: true };
      jobs.set(id, started);
      finishAt.set(id, Date.now() + runMs);
      return started;
    },
    setEnabled: async (id, enabled) => {
      await wait(300);
      const updated = { ...find(id), enabled, nextRunAt: enabled ? at(14 * HOUR) : null };
      jobs.set(id, updated);
      return updated;
    },
  };
}
