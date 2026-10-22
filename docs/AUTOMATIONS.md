# Automations (scheduled jobs)

Work the app does by itself on a schedule: syncing the waste calendar, retrying shop icons, cleaning up.
There is **no system crontab**. A scheduler runs inside the app process (pm2 `wickedhome` in production,
`wickedhome-dev` in development; each has its own database, so each runs its own jobs). Nothing has to be
set up on the server, and every job is visible and controllable under **Settings → Automations**.

```
src/api/jobs/
  job-registry.ts     registerJob(): the contract features use
  job-schedule.ts     cron maths in Europe/Brussels, the catch-up decision
  job-runner.ts       runs one job: lock, run log, timeout, never throws
  job-lock.ts         Postgres advisory lock per job (dedicated pg connection)
  job-scheduler.ts    croner timers, catch-up at startup, shutdown, "run now"
  job-store.ts        JobRun / JobSetting persistence (prisma/schema/jobs.prisma)
  job-prune.ts        run-log retention policy
  jobs.service.ts     the API's view of the jobs
  jobs.routes.ts      /api/jobs
  run-history.jobs.ts the scheduler's own housekeeping job (jobs.prune-runs)
  run-job.ts          npm run job -- <jobId>
src/features/automations/   the Settings section (AutomationsSection), contracts, EN/NL texts
```

## Adding a job to a feature

Background work is always a job. Never use `setInterval`/`setTimeout` loops for it: those are invisible,
can't be paused, run twice when two processes share a database, and are lost silently when they throw.

1. Write the work as a service function that takes an `AbortSignal` (pass it to `fetch`, check it in loops)
   and is safe to run twice.
2. Register it in `src/api/<feature>/<feature>.jobs.ts`:

```ts
import { registerJob } from "../jobs/job-registry";
import { syncAllWasteSetups } from "./waste.service";

registerJob({
  id: "waste.sync",                         // <feature>.<name>, stable: run history and settings use it
  schedule: "15 5 * * *",                   // 5-field cron, Europe/Brussels: every day at 05:15
  titleKey: "waste:jobs.sync.title",        // i18n keys from your feature's locales (EN + NL)
  descriptionKey: "waste:jobs.sync.description",
  runOnStartupIfMissed: true,               // run once after a restart that missed the scheduled time
  // timeoutMs: 10 * 60 * 1000,             // default 10 minutes; the signal aborts after it
  // enabledByDefault: true,                // false: the job waits until someone switches it on
  // recordIdleRuns: true,                  // false: scheduled runs returning { idle: true } leave no trace
  run: async ({ signal, trigger, log }) => {
    const { summary, failed } = await syncAllWasteSetups({ signal, log });
    if (failed > 0) throw new Error(summary); // throwing marks the run failed (shown in Settings)
    return { summary };                       // optional one-liner, shown as the last result
  },
});
```

3. Import it once from your router so it registers when the app starts: `import "./waste.jobs";` in
   `waste.routes.ts`.
4. Add `jobs.<name>.title` and `jobs.<name>.description` to `src/features/<feature>/locales/{en,nl}.json`.

The contract (`JobDefinition` in `job-registry.ts`):

| Field | |
|---|---|
| `id` | `<feature>.<name>`, lowercase. Duplicate or malformed ids throw at startup. |
| `schedule` | 5-field cron (minute hour day month weekday), always **Europe/Brussels**. Validated at startup. |
| `titleKey`, `descriptionKey` | `namespace:key` i18n keys, translated in the UI. |
| `runOnStartupIfMissed` | Default `false`. See *Catch-up*. |
| `timeoutMs` | Default 10 minutes. |
| `enabledByDefault` | Default `true`. The switch in Settings overrides it (`job_settings`). |
| `recordIdleRuns` | Default `true`. `false` for frequent jobs that mostly find nothing to do: see *Idle runs*. |
| `run(ctx)` | `ctx = { signal, trigger: "schedule" \| "manual" \| "startup", log(message) }`. May return `{ summary, idle }` (`idle: true` = nothing to do). |

Pick a time in the early morning and spread jobs out (not everything at 00:00). Current jobs:

| Job | When | What |
|---|---|---|
| `jobs.prune-runs` | 03:40 | Run log retention |
| `audit.prune` | 03:55 (+ catch-up) | Deletes activity log entries older than 365 days ([AUDIT.md](AUDIT.md)) |
| `notifications.prune` | 04:10 (+ catch-up) | Deletes notifications older than 90 days ([NOTIFICATIONS.md](NOTIFICATIONS.md)) |
| `shops.icons` | 04:20 | Retries shop icons whose last fetch failed |
| `shopping.barcode-cache` | 04:35 | Deletes barcode lookups long past reuse (hits > 180 days, misses > 30) and their photos, except photos a saved product uses |
| `documents.abandoned-uploads` | 04:50 (+ catch-up) | Removes uploads registered > 24 h ago that never got their content |
| `waste.sync` | 05:15 (+ catch-up) | Fetches every household's waste collection calendar, then updates its bins tasks |
| `tasks.pay-tasks` | 06:25 (+ catch-up) | Reconciles the "Pay …" tasks with the expenses (create, update, complete, reopen, remove) |
| `expenses.auto-pay` | 06:10 (+ catch-up) | Marks unpaid direct debits paid on their due date (up to 7 days back; an undone one stays unpaid) |
| `income.voucher-tasks` | 06:45 (+ catch-up) | Keeps "Use € … meal vouchers before …" tasks for vouchers expiring within 30 days ([FINANCE.md](FINANCE.md#meal-vouchers-expiry-and-who-pays)) |
| `home-assistant.energy` | hourly at :07 (+ catch-up; also right after the first connection) | Imports Home Assistant's hourly energy statistics into energy intervals (no-op until Home Assistant is configured) |
| `home-assistant.refresh-states` | every 15 min | Re-applies bound entity states that Home Assistant reported again without a change, so they don't go stale |
| `integrations.google-calendar` | every 15 min | Syncs everyone's chosen Google calendars (incremental, sync tokens) and publishes household events where turned on (no-op until Google is connected) |
| `integrations.google-mail` | every 2 h at :40 (+ catch-up) | Searches connected Gmail mailboxes for bills from the sender rules and adds suggested expenses (and notifies the adults when it found some) |
| `tasks.reminders` | every minute (idle runs not recorded) | Pushes task reminders that are due (`remindedAt IS NULL AND remindAt <= now`, one index lookup); claims each by setting `remindedAt`, sends it when < 30 min late, otherwise skips and marks it ([TASKS.md](TASKS.md#time-and-reminders)) |
| `notifications.dispatch` | every 5 min | Pushes what quiet hours held back once they end, and runs the scheduled notifiers features register (bins, task digest, payments, meal vouchers, Home Assistant offline); each checks the person's chosen time and de-duplicates by tag, so a second run sends nothing twice ([NOTIFICATIONS.md](NOTIFICATIONS.md)) |

## How a run works

1. **Trigger**: the job's croner timer fires (`schedule`), someone clicks *Run now* (`manual`), the catch-up
   at startup decides it was missed (`startup`), or `npm run job -- <id>` (`manual`).
2. **Paused?** Scheduled runs of a paused job don't happen (and aren't logged). *Run now* works for paused
   jobs too.
3. **Lock**: one run per job at a time. In-process first (a second trigger while running is *skipped*),
   then across processes with a Postgres advisory lock (below). A skipped run is logged with the reason.
4. **Run log**: a `job_runs` row is created as `RUNNING`, then finished as `SUCCEEDED` or `FAILED` with
   duration, summary, error and the lines from `ctx.log()` (capped at 200 lines).
5. **Timeout**: after `timeoutMs` the signal aborts. A job that ignores the abort gets 5 s more, then the run
   is closed as failed anyway ("Timed out after 10 min").
6. **Errors** never crash the process: a throwing job, a broken database connection, a failing lock are all
   caught, logged to the console (`[jobs] …`) and, where possible, recorded on the run.

## Locking

Each job's lock is `pg_try_advisory_lock(key)`, with `key` a signed 64-bit hash of `wickedhome:job:<id>`.
It is a **session-level** lock, held on a **dedicated `pg` connection** from a small pool in `job-lock.ts`
for as long as the run lasts, and released with `pg_advisory_unlock` in `finally`. If the process dies,
the connection closes and Postgres releases the lock by itself.

Why not a Prisma raw query: a session lock belongs to the connection that took it, and Prisma's pool may
run the lock and the unlock on different connections. Why not an interactive Prisma transaction with
`pg_try_advisory_xact_lock`: it pins a connection *and* keeps a transaction open for the whole run (holding
back vacuum for long jobs), and Prisma's transaction timeout (5 s by default) would kill longer jobs.

Today dev and production use separate databases, so the cross-process lock mostly guards against
`npm run job` running a job the app is running, and against a future second process.

## Catch-up

At startup the scheduler waits 20 s (so startup isn't slowed), then for each enabled job with
`runOnStartupIfMissed`: if a scheduled time passed since its last successful run (or it never succeeded),
it runs once, one job after the other. A catch-up that fails isn't retried on the next restart for the
same missed time (`shouldCatchUp` in `job-schedule.ts`): in development every saved file restarts the
server, and a broken job must not hammer an external service.

Also at startup, runs left `RUNNING` by a crashed or killed process are marked failed ("Interrupted…"),
unless another process holds that job's lock (then it really is running).

## Time zone and DST

Schedules are evaluated in Europe/Brussels with croner, so `15 5 * * *` is 05:15 local all year. On the
spring-forward night a time inside the missing hour (02:30) runs once at 03:30; on the fall-back night a
time inside the repeated hour runs once, not twice. Avoid 02:00–03:00 for daily jobs anyway. Interval
schedules (`*/30 * * * *`) skip the first pass of the repeated hour.

## Run log retention

### Idle runs

A job that runs every minute and mostly finds nothing to do (`tasks.reminders`) would fill the run history and
the console with "0 sent" lines. With `recordIdleRuns: false`, a **scheduled** run that returns `{ idle: true }`
writes no `job_runs` row and no console line; the runner only keeps its time in memory (`lastCheckedAt`).
The row is created only once the run turns out to have done something (lines from `ctx.log()` are held back
until then), and failed runs, skipped runs and *Run now* are always recorded. Settings → Automations then
shows **Last run** (the last real one, e.g. "1 reminder sent") and **Last check** ("20 s ago"; empty right
after a restart until the job has run once). Catch-up (`runOnStartupIfMissed`) needs recorded successes, so
don't combine the two.

`jobs.prune-runs` (daily 03:40) keeps, per job, everything from the last 90 days, always at least the
newest 20 runs (so a monthly job keeps its history), and never more than 500 (`job-prune.ts`).

## Where to see runs

- **Settings → Automations** (`/settings#automations`): every job with its schedule in words, next run, last
  result, a pause switch and *Run now* (owners and adults; children see it read-only). *Recent runs* opens
  the last 10 runs with errors and logs. While a job runs the section polls it every 2 s.
- **API**: `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/:id/runs?limit=50`, `POST /api/jobs/:id/run`
  (202, starts in the background; 409 when already running), `PATCH /api/jobs/:id { enabled }`.
- **Console**: `pm2 logs wickedhome-dev | grep '\[jobs\]'`.
- **Database**: `job_runs`, `job_settings`.

## Running a job by hand

```bash
npm run job                     # lists the jobs
npm run job -- waste.sync       # runs one now, through the same runner (lock, run log); exit code 0/1
```

It uses `DATABASE_URL` from `.env` (or the environment), so it runs against the development database
unless told otherwise. The in-app scheduler makes a system crontab unnecessary; this command is for
debugging, or for calling a job from outside the app if that is ever wanted.

## Tests

`src/api/jobs/jobs.test.ts` (next-run maths incl. DST, catch-up decision, locking/no-overlap/timeouts with
an in-memory store and lock, pruning) and `src/features/automations/types/schedule-description.test.ts`.
Both run with `npm test`.
