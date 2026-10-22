import { AUDIT_RETENTION_DAYS } from "@/features/audit/types/audit";
import { registerJob } from "../jobs/job-registry";
import { pruneAuditEntries } from "./audit.service";

/** Retention: activity log entries older than 365 days are deleted every night. */
registerJob({
  id: "audit.prune",
  schedule: "55 3 * * *",
  titleKey: "audit:jobs.prune.title",
  descriptionKey: "audit:jobs.prune.description",
  runOnStartupIfMissed: true,
  run: async ({ log }) => {
    const count = await pruneAuditEntries(new Date(), AUDIT_RETENTION_DAYS);
    log(`${count} entries older than ${AUDIT_RETENTION_DAYS} days deleted`);
    return { summary: `${count} entries removed` };
  },
});
