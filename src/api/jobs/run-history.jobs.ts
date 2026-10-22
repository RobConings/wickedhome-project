import { selectRunsToPrune } from "./job-prune";
import { registerJob } from "./job-registry";
import { deleteRuns, loadPrunableRuns } from "./job-store";

/** The scheduler's own housekeeping: keeps the run log small (see job-prune.ts for the policy). */
registerJob({
  id: "jobs.prune-runs",
  schedule: "40 3 * * *",
  titleKey: "automations:jobs.pruneRuns.title",
  descriptionKey: "automations:jobs.pruneRuns.description",
  run: async ({ log }) => {
    const runs = await loadPrunableRuns();
    const ids = selectRunsToPrune(runs, new Date());
    const deleted = ids.length ? await deleteRuns(ids) : 0;
    log(`${runs.length} runs in the log, ${deleted} removed`);
    return { summary: `${deleted} old runs removed` };
  },
});
