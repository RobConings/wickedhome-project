import { registerJob } from "../jobs/job-registry";
import { db } from "../lib/db";

/** Housekeeping: expired sessions and expired invite / reset links are deleted every night. */
registerJob({
  id: "auth.cleanup",
  schedule: "20 3 * * *",
  titleKey: "auth:jobs.cleanup.title",
  descriptionKey: "auth:jobs.cleanup.description",
  runOnStartupIfMissed: true,
  run: async ({ log }) => {
    const now = new Date();
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    const links = await db.invite.deleteMany({ where: { expiresAt: { lt: now } } });
    log(`${sessions.count} expired sessions and ${links.count} expired links deleted`);
    return { summary: `${sessions.count} sessions, ${links.count} links removed` };
  },
});
