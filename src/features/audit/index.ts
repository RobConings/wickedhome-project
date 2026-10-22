// Public API of the audit feature (the household activity log, src/api/audit, docs/AUDIT.md). Shown on the
// Settings page (src/routes/settings.tsx) to owners and adults as `<ActivitySection />`, which loads its own data.
export { ActivitySection } from "./components/activity-section";
export { AuditEntryRow, AuditEntryTile } from "./components/audit-entry-row";
export { auditClient, fetchAuditPage, type AuditClient } from "./data/audit-requests";
export { AUDIT_CHANNELS, AUDIT_RETENTION_DAYS, type AuditChannel, type AuditEntry, type AuditPage, type AuditQuery } from "./types/audit";
