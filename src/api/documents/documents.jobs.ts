import { registerJob } from "../jobs/job-registry";
import { MOVE_JOB_ID, processDueMoves } from "./document-targets.service";
import { removeAbandonedUploads } from "./documents.service";

/** Removes uploads that were registered but never received their content (closed tab, lost connection). */
registerJob({
  id: "documents.abandoned-uploads",
  schedule: "50 4 * * *",
  titleKey: "documents:jobs.abandonedUploads.title",
  descriptionKey: "documents:jobs.abandonedUploads.description",
  runOnStartupIfMissed: true,
  run: async () => {
    const count = await removeAbandonedUploads();
    return { summary: count === 0 ? "Nothing to clean up" : `${count} unfinished uploads removed` };
  },
});

/**
 * Moves documents waiting for their storage target (bills → Google Drive when Drive was unavailable at upload,
 * or after "move existing"). Retries with backoff; the local copy goes only after the remote one is verified.
 */
registerJob({
  id: MOVE_JOB_ID,
  schedule: "4,19,34,49 * * * *",
  titleKey: "documents:jobs.moveToTargets.title",
  descriptionKey: "documents:jobs.moveToTargets.description",
  runOnStartupIfMissed: true,
  timeoutMs: 30 * 60 * 1000,
  run: async ({ signal, log }) => {
    const { moved, failed, waiting } = await processDueMoves({ signal, log });
    const summary =
      moved + failed + waiting === 0 ? "Nothing to move" : `${moved} moved${waiting > 0 ? `, ${waiting} waiting for the target to be available` : ""}`;
    if (failed > 0) throw new Error(`${summary}, ${failed} still waiting (retried later)`);
    return { summary };
  },
});
