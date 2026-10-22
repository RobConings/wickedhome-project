import { registerJob } from "../jobs/job-registry";
import { syncAllCalendars } from "./google-calendar.service";
import { scanAllMailboxes } from "./gmail.service";

registerJob({
  id: "integrations.google-calendar",
  schedule: "*/15 * * * *",
  titleKey: "integrations:jobs.google-calendar.title",
  descriptionKey: "integrations:jobs.google-calendar.description",
  timeoutMs: 5 * 60 * 1000,
  run: async ({ signal, log }) => {
    const { synced, failed } = await syncAllCalendars({ signal, log });
    const summary = `${synced} Google account(s) synced`;
    if (failed > 0) throw new Error(`${summary}, ${failed} problem(s)`);
    return { summary };
  },
});

registerJob({
  id: "integrations.google-mail",
  // Every 30 minutes at :10 and :40, away from the quarter-hour calendar sync.
  schedule: "10,40 * * * *",
  titleKey: "integrations:jobs.google-mail.title",
  descriptionKey: "integrations:jobs.google-mail.description",
  runOnStartupIfMissed: true,
  run: async ({ signal, log }) => {
    const { added, failed } = await scanAllMailboxes({ signal, log });
    const summary = `${added} new suggestion(s)`;
    if (failed > 0) throw new Error(`${summary}, ${failed} mailbox(es) failed`);
    return { summary };
  },
});
