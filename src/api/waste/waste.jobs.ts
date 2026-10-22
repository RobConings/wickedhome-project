import { registerJob } from "../jobs/job-registry";
import { syncAllWasteSetups } from "./waste.service";

/**
 * Fetches every household's collection calendar from its collector each morning (and once after a restart
 * that missed it). A failed setup keeps its previous collections; the run is marked failed so it shows.
 */
registerJob({
  id: "waste.sync",
  schedule: "15 5 * * *",
  titleKey: "waste:jobs.sync.title",
  descriptionKey: "waste:jobs.sync.description",
  runOnStartupIfMissed: true,
  run: async ({ signal, log }) => {
    const { summary, failed } = await syncAllWasteSetups({ signal, log });
    if (failed > 0) throw new Error(summary);
    return { summary };
  },
});
