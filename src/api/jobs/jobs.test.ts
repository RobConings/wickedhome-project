/**
 * Unit tests for the scheduler core: next-run maths in Europe/Brussels (incl. DST), the catch-up decision,
 * the runner's locking / no-overlap / timeout behaviour (with an in-memory store and lock) and run-log
 * pruning. No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/jobs/jobs.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobLock } from "./job-lock";
import { lockKey } from "./job-lock";
import { selectRunsToPrune, type PrunableRun } from "./job-prune";
import { registerJob, unregisterJob, type JobDefinition, type RegisteredJob } from "./job-registry";
import { createJobRunner } from "./job-runner";
import { assertValidSchedule, nextRunAfter, shouldCatchUp } from "./job-schedule";
import type { FinishedRun, JobStore } from "./job-store";

const iso = (date: Date | null) => date?.toISOString() ?? null;
const next = (schedule: string, after: string) => iso(nextRunAfter(schedule, new Date(after)));

describe("nextRunAfter (Europe/Brussels)", () => {
  it("runs at the local time in winter (UTC+1) and summer (UTC+2)", () => {
    assert.equal(next("15 5 * * *", "2026-01-10T12:00:00Z"), "2026-01-11T04:15:00.000Z");
    assert.equal(next("15 5 * * *", "2026-07-10T12:00:00Z"), "2026-07-11T03:15:00.000Z");
  });

  it("is strictly after the given time", () => {
    assert.equal(next("15 5 * * *", "2026-07-11T03:15:00.000Z"), "2026-07-12T03:15:00.000Z");
    assert.equal(next("15 5 * * *", "2026-07-11T03:14:59.999Z"), "2026-07-11T03:15:00.000Z");
  });

  it("keeps 05:15 local across the spring-forward night", () => {
    // 29 March 2026: 02:00 CET → 03:00 CEST.
    assert.equal(next("15 5 * * *", "2026-03-28T12:00:00Z"), "2026-03-29T03:15:00.000Z");
    assert.equal(next("15 5 * * *", "2026-03-27T12:00:00Z"), "2026-03-28T04:15:00.000Z");
  });

  it("runs a time inside the missing hour once, right after the jump", () => {
    const first = nextRunAfter("30 2 * * *", new Date("2026-03-28T12:00:00Z"));
    assert.equal(iso(first), "2026-03-29T01:30:00.000Z"); // 03:30 CEST
    assert.equal(iso(nextRunAfter("30 2 * * *", first ?? new Date())), "2026-03-30T00:30:00.000Z"); // back to 02:30 CEST
  });

  it("runs a time inside the repeated hour once on the fall-back night", () => {
    // 25 October 2026: 03:00 CEST → 02:00 CET, so 02:30 happens twice.
    const first = nextRunAfter("30 2 * * *", new Date("2026-10-24T12:00:00Z"));
    assert.ok(first);
    const second = nextRunAfter("30 2 * * *", first);
    assert.equal(second?.toISOString().slice(0, 10), "2026-10-26", "only one run on the 25th");
    assert.equal(iso(second), "2026-10-26T01:30:00.000Z"); // 02:30 CET
    assert.equal(next("15 5 * * *", "2026-10-24T12:00:00Z"), "2026-10-25T04:15:00.000Z"); // 05:15 CET
  });

  it("keeps interval schedules moving forward through both DST nights", () => {
    for (const start of ["2026-03-28T22:00:00Z", "2026-10-24T22:00:00Z"]) {
      let cursor = new Date(start);
      for (let index = 0; index < 12; index += 1) {
        const following = nextRunAfter("*/30 * * * *", cursor);
        assert.ok(following && following > cursor, "strictly increasing");
        assert.ok(following.getTime() - cursor.getTime() <= 90 * 60_000, "never a gap of more than the shifted hour");
        cursor = following;
      }
    }
  });

  it("handles weekdays and month days", () => {
    // 2 October 2026 is a Friday: the next Monday 07:00 is 5 October, 05:00 UTC.
    assert.equal(next("0 7 * * 1", "2026-10-02T10:00:00Z"), "2026-10-05T05:00:00.000Z");
    assert.equal(next("0 6 1 * *", "2026-10-02T10:00:00Z"), "2026-11-01T05:00:00.000Z");
  });
});

describe("assertValidSchedule", () => {
  it("accepts 5-field expressions", () => {
    for (const schedule of ["15 5 * * *", "*/10 * * * *", "0 7 * * 1-5", "0 6 1,15 * *"]) assertValidSchedule(schedule);
  });
  it("rejects other field counts and nonsense", () => {
    assert.throws(() => assertValidSchedule("0 15 5 * * *"), /5 fields/);
    assert.throws(() => assertValidSchedule("every day"), /5 fields/);
    assert.throws(() => assertValidSchedule("61 5 * * *"), /invalid/);
  });
});

describe("shouldCatchUp", () => {
  const schedule = "15 5 * * *"; // 03:15 UTC in summer
  const now = new Date("2026-07-11T09:00:00Z");
  const at = (text: string) => new Date(text);

  it("runs when a scheduled time passed since the last success", () => {
    assert.equal(shouldCatchUp({ schedule, now, lastSuccessAt: at("2026-07-10T03:15:00Z"), lastStartupRunAt: null }), true);
  });
  it("doesn't run when the last success is after the previous scheduled time", () => {
    assert.equal(shouldCatchUp({ schedule, now, lastSuccessAt: at("2026-07-11T03:15:02Z"), lastStartupRunAt: null }), false);
    // A manual run after this morning's slot counts too.
    assert.equal(shouldCatchUp({ schedule, now, lastSuccessAt: at("2026-07-11T08:00:00Z"), lastStartupRunAt: null }), false);
  });
  it("runs when the job never succeeded", () => {
    assert.equal(shouldCatchUp({ schedule, now, lastSuccessAt: null, lastStartupRunAt: null }), true);
  });
  it("tries a missed slot only once: no new catch-up after a failed catch-up for the same slot", () => {
    const lastSuccessAt = at("2026-07-09T03:15:00Z");
    assert.equal(shouldCatchUp({ schedule, now, lastSuccessAt, lastStartupRunAt: at("2026-07-11T07:00:00Z") }), false);
    // But a catch-up from yesterday doesn't cover today's missed slot.
    assert.equal(shouldCatchUp({ schedule, now, lastSuccessAt, lastStartupRunAt: at("2026-07-10T07:00:00Z") }), true);
  });
});

// Runner ---------------------------------------------------------------------------------------------------

type StoredRun = { id: string; jobId: string; trigger: string; status: string; startedAt: Date } & Omit<Partial<FinishedRun>, "status">;

function memoryStore() {
  const runs: StoredRun[] = [];
  const store: JobStore = {
    async startRun(jobId, trigger, startedAt) {
      const id = `run-${runs.length + 1}`;
      runs.push({ id, jobId, trigger, status: "running", startedAt });
      return id;
    },
    async finishRun(runId, result) {
      const run = runs.find((item) => item.id === runId);
      assert.ok(run);
      Object.assign(run, result);
    },
    async recordSkipped(jobId, trigger, at, reason) {
      runs.push({ id: `run-${runs.length + 1}`, jobId, trigger, status: "skipped", startedAt: at, error: reason });
    },
  };
  return { store, runs };
}

/** Like Postgres advisory locks: one holder per key, shared by every "process" (runner) using it. */
function memoryLock() {
  const held = new Set<string>();
  const lock: JobLock = {
    async tryAcquire(jobId) {
      if (held.has(jobId)) return null;
      held.add(jobId);
      return async () => {
        held.delete(jobId);
      };
    },
  };
  return { lock, held };
}

const silent = { log: () => undefined, error: () => undefined };

const testJob = (overrides: Partial<JobDefinition> = {}): RegisteredJob => ({
  id: "test.job",
  schedule: "15 5 * * *",
  titleKey: "automations:jobs.test.title",
  descriptionKey: "automations:jobs.test.description",
  runOnStartupIfMissed: false,
  timeoutMs: 5_000,
  enabledByDefault: true,
  recordIdleRuns: true,
  run: async () => ({ summary: "ok" }),
  ...overrides,
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};

describe("job runner", () => {
  it("leaves no trace of idle scheduled runs when a job doesn't record them, but records real and manual ones", async () => {
    const { store, runs } = memoryStore();
    const lines: string[] = [];
    const runner = createJobRunner({ store, lock: memoryLock().lock, logger: { log: (line: string) => lines.push(line), error: () => undefined } });
    let due = 0;
    const job = testJob({
      recordIdleRuns: false,
      run: ({ log }) => {
        if (due > 0) log(`${due} sent`);
        return { summary: `${due} sent`, idle: due === 0 };
      },
    });
    assert.deepEqual(await runner.run(job, "schedule"), { status: "succeeded", summary: "0 sent", idle: true });
    assert.equal(runs.length, 0, "no run row");
    assert.equal(lines.length, 0, "no console line");
    assert.ok(runner.lastCheckedAt(job.id), "the check time is kept");
    // Started by hand: always recorded, idle or not.
    await runner.run(job, "manual");
    assert.equal(runs.length, 1);
    due = 2;
    await runner.run(job, "schedule");
    assert.equal(runs.length, 2);
    assert.equal(runs[1]?.summary, "2 sent");
    assert.match(runs[1]?.log ?? "", /2 sent/);
    assert.ok(lines.some((line) => line.includes("2 sent")));
    // A job that records idle runs keeps doing so.
    await runner.run(testJob({ id: "test.other", run: () => ({ idle: true }) }), "schedule");
    assert.equal(runs.length, 3);
  });

  it("records a successful run with its summary, duration and log", async () => {
    const { store, runs } = memoryStore();
    const runner = createJobRunner({ store, lock: memoryLock().lock, logger: silent });
    const outcome = await runner.run(
      testJob({
        run: ({ log, trigger }) => {
          log(`hello from ${trigger}`);
          return { summary: "3 things done" };
        },
      }),
      "manual",
    );
    assert.deepEqual(outcome, { status: "succeeded", summary: "3 things done" });
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.status, "succeeded");
    assert.equal(runs[0]?.trigger, "manual");
    assert.equal(runs[0]?.summary, "3 things done");
    assert.match(runs[0]?.log ?? "", /hello from manual/);
    assert.equal(typeof runs[0]?.durationMs, "number");
  });

  it("skips a second run of the same job while the first is running (same process)", async () => {
    const { store, runs } = memoryStore();
    const runner = createJobRunner({ store, lock: memoryLock().lock, logger: silent });
    const gate = deferred();
    const job = testJob({ run: () => gate.promise });
    const first = runner.run(job, "schedule");
    const second = await runner.run(job, "manual");
    assert.equal(second.status, "skipped");
    assert.equal(runner.isRunning(job.id), true);
    gate.resolve();
    assert.equal((await first).status, "succeeded");
    assert.equal(runner.isRunning(job.id), false);
    assert.deepEqual(runs.map((run) => run.status).sort(), ["skipped", "succeeded"]);
  });

  it("skips a run when another process holds the job's lock, and releases the lock afterwards", async () => {
    const { lock, held } = memoryLock();
    const processA = createJobRunner({ store: memoryStore().store, lock, logger: silent });
    const b = memoryStore();
    const processB = createJobRunner({ store: b.store, lock, logger: silent });
    const gate = deferred();
    const job = testJob({ run: () => gate.promise });
    const running = processA.run(job, "schedule");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(held.has(job.id), true);
    const outcome = await processB.run(job, "schedule");
    assert.equal(outcome.status, "skipped");
    assert.match(outcome.error ?? "", /another process/);
    assert.equal(b.runs[0]?.status, "skipped");
    gate.resolve();
    await running;
    assert.equal(held.has(job.id), false, "lock released in finally");
    assert.equal((await processB.run(job, "manual")).status, "succeeded");
  });

  it("other jobs run at the same time", async () => {
    const runner = createJobRunner({ store: memoryStore().store, lock: memoryLock().lock, logger: silent });
    const gate = deferred();
    const slow = runner.run(testJob({ id: "test.slow", run: () => gate.promise }), "schedule");
    assert.equal((await runner.run(testJob({ id: "test.fast" }), "schedule")).status, "succeeded");
    gate.resolve();
    await slow;
  });

  it("marks a throwing job failed with its message and never throws itself", async () => {
    const { store, runs } = memoryStore();
    const { lock, held } = memoryLock();
    const runner = createJobRunner({ store, lock, logger: silent });
    const outcome = await runner.run(
      testJob({
        run: () => {
          throw new Error("Provider answered 503");
        },
      }),
      "schedule",
    );
    assert.deepEqual(outcome, { status: "failed", error: "Provider answered 503" });
    assert.equal(runs[0]?.status, "failed");
    assert.equal(runs[0]?.error, "Provider answered 503");
    assert.equal(held.size, 0);
  });

  it("aborts the signal on timeout and records the timeout", async () => {
    const { store, runs } = memoryStore();
    const runner = createJobRunner({ store, lock: memoryLock().lock, logger: silent });
    let aborted = false;
    const outcome = await runner.run(
      testJob({
        timeoutMs: 30,
        run: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("This operation was aborted"));
            });
          }),
      }),
      "schedule",
    );
    assert.equal(aborted, true);
    assert.equal(outcome.status, "failed");
    assert.match(outcome.error ?? "", /Timed out after/);
    assert.match(runs[0]?.error ?? "", /Timed out after/);
  });

  it("closes the run after the grace period when a job ignores the abort", async () => {
    const { lock, held } = memoryLock();
    const runner = createJobRunner({ store: memoryStore().store, lock, abortGraceMs: 20, logger: silent });
    const outcome = await runner.run(testJob({ timeoutMs: 20, run: () => new Promise(() => undefined) }), "schedule");
    assert.equal(outcome.status, "failed");
    assert.equal(held.size, 0);
  });

  it("abortAll stops running jobs (shutdown) and idle() waits for them", async () => {
    const runner = createJobRunner({ store: memoryStore().store, lock: memoryLock().lock, abortGraceMs: 50, logger: silent });
    const running = runner.run(
      testJob({ run: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))) }),
      "schedule",
    );
    await new Promise((resolve) => setImmediate(resolve));
    runner.abortAll("Stopped: shutting down");
    await runner.idle(1_000);
    assert.deepEqual(await running, { status: "failed", error: "Stopped: shutting down" });
  });

  it("reports a failure to take the lock as a failed run instead of throwing", async () => {
    const lock: JobLock = { tryAcquire: async () => Promise.reject(new Error("connection refused")) };
    const runner = createJobRunner({ store: memoryStore().store, lock, logger: silent });
    assert.deepEqual(await runner.run(testJob(), "schedule"), { status: "failed", error: "connection refused" });
    assert.equal(runner.isRunning("test.job"), false);
  });
});

describe("lockKey", () => {
  it("is a stable signed 64-bit key per job id", () => {
    assert.equal(lockKey("waste.sync"), lockKey("waste.sync"));
    assert.notEqual(lockKey("waste.sync"), lockKey("shops.icons"));
    const key = lockKey("waste.sync");
    assert.ok(key >= -(2n ** 63n) && key < 2n ** 63n);
  });
});

describe("registerJob", () => {
  it("applies defaults and rejects bad definitions", () => {
    const job = registerJob({ id: "test.defaults", schedule: " 0 6 * * * ", titleKey: "a:b", descriptionKey: "a:c", run: () => undefined });
    try {
      assert.equal(job.schedule, "0 6 * * *");
      assert.equal(job.enabledByDefault, true);
      assert.equal(job.runOnStartupIfMissed, false);
      assert.equal(job.timeoutMs, 10 * 60 * 1000);
      assert.throws(() => registerJob({ ...job }), /already registered/);
    } finally {
      unregisterJob("test.defaults");
    }
    const base = { schedule: "0 6 * * *", titleKey: "a:b", descriptionKey: "a:c", run: () => undefined };
    assert.throws(() => registerJob({ ...base, id: "NoFeature" }), /<feature>\.<name>/);
    assert.throws(() => registerJob({ ...base, id: "test.bad-key", titleKey: "Plain title" }), /i18n key/);
    assert.throws(() => registerJob({ ...base, id: "test.bad-cron", schedule: "daily" }), /5 fields/);
  });
});

// Pruning --------------------------------------------------------------------------------------------------

describe("selectRunsToPrune", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const runs = (jobId: string, count: number, everyDays: number, status: PrunableRun["status"] = "succeeded"): PrunableRun[] =>
    Array.from({ length: count }, (_, index) => ({ id: `${jobId}-${index}`, jobId, startedAt: daysAgo(index * everyDays), status }));
  const policy = { maxAgeDays: 90, keepAtLeast: 20, keepAtMost: 500 };

  it("removes runs older than 90 days", () => {
    const doomed = selectRunsToPrune(runs("daily", 120, 1), now, policy);
    assert.equal(doomed.length, 120 - 91); // days 0…90 stay
    assert.ok(doomed.includes("daily-119"));
    assert.ok(!doomed.includes("daily-90"));
  });

  it("always keeps the newest runs of a rarely running job", () => {
    assert.deepEqual(selectRunsToPrune(runs("monthly", 20, 30), now, policy), []);
    assert.deepEqual(selectRunsToPrune(runs("monthly", 22, 30), now, policy), ["monthly-20", "monthly-21"]);
  });

  it("caps the number of runs per job", () => {
    const doomed = selectRunsToPrune(runs("frequent", 600, 0.01), now, policy);
    assert.equal(doomed.length, 100);
    assert.ok(doomed.includes("frequent-599") && !doomed.includes("frequent-499"));
  });

  it("never removes running runs and judges each job by itself", () => {
    const running = runs("busy", 1, 200, "running");
    assert.deepEqual(selectRunsToPrune([...running, ...runs("other", 5, 1)], now, policy), []);
  });
});
