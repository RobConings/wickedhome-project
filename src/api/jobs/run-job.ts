/**
 * Runs one job from the command line, through the same runner as the scheduler (lock, run log, timeout):
 *
 *   npm run job -- <jobId>          e.g. npm run job -- shops.icons
 *   npm run job                     lists the job ids
 *
 * The run is recorded with trigger "manual". Exit code 0 when it succeeded, 1 when it failed or was skipped
 * (already running elsewhere). The scheduler inside the app makes a system crontab unnecessary; this is for
 * debugging, or for calling a job from outside the app if that's ever wanted.
 */
import "../app"; // Importing the feature routers registers their jobs.
import { db } from "../lib/db";
import { listJobs } from "./job-registry";
import { runJobToCompletion, stopScheduler } from "./job-scheduler";

const jobId = process.argv[2];
let exitCode = 1;

if (!jobId || !listJobs().some((job) => job.id === jobId)) {
  if (jobId) console.error(`Unknown job "${jobId}".`);
  console.error(`Usage: npm run job -- <jobId>\nJobs:\n${listJobs().map((job) => `  ${job.id.padEnd(28)} ${job.schedule}`).join("\n")}`);
} else {
  const stop = () => void stopScheduler();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const outcome = await runJobToCompletion(jobId);
  console.log(`${jobId}: ${outcome.status}${outcome.error ? ` (${outcome.error})` : outcome.summary ? ` (${outcome.summary})` : ""}`);
  exitCode = outcome.status === "succeeded" ? 0 : 1;
}

await stopScheduler();
await db.$disconnect();
// Other modules may hold timers (e.g. feature caches); don't wait for them.
process.exit(exitCode);
