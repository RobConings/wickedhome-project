import { z } from "zod";

/**
 * Audit log: who changed what in the household, and through which channel (the app, the assistant chat, an MCP
 * client or a scheduled job). Written by the API (src/api/audit), shown under Settings → Activity to owners and
 * adults, kept 365 days. Never holds secrets: no codes, tokens or passwords.
 */

export const AUDIT_CHANNELS = ["app", "assistant", "mcp", "job"] as const;
export const auditChannelSchema = z.enum(AUDIT_CHANNELS);
export type AuditChannel = z.infer<typeof auditChannelSchema>;

/** How long entries are kept (job `audit.prune`). */
export const AUDIT_RETENTION_DAYS = 365;

/**
 * Action keys written by the app itself. Assistant and MCP writes use the tool's name (`tasks.complete`), so
 * the list is open: the UI translates the keys it knows and shows the summary for the others.
 */
export const AUDIT_ACTIONS = [
  "alarm.armed_home",
  "alarm.armed_away",
  "alarm.disarmed",
  "alarm.attempt_failed",
  "account.role_changed",
  "account.disabled",
  "account.enabled",
  "account.signed_out",
  "account.reset_link",
  "account.removed",
  "invite.created",
  "invite.revoked",
  "invite.accepted",
  "payment_account.corrected",
  "payment_account.correction_deleted",
  "expense.auto_paid",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  channel: auditChannelSchema,
  /** The account that acted; null for jobs and removed accounts. */
  userId: z.string().nullable(),
  actorName: z.string(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  targetLabel: z.string().nullable(),
  summary: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const AUDIT_PAGE_SIZE = 50;

/** `GET /api/audit` query: filters, search and the cursor of the next page. */
export const auditQuerySchema = z.object({
  channel: auditChannelSchema.optional(),
  userId: z.string().min(1).max(64).optional(),
  /** An exact action key, or a domain prefix ending in a dot (`alarm.`). */
  action: z.string().min(1).max(80).optional(),
  q: z.string().trim().max(100).optional(),
  /** The `nextCursor` of the previous page. */
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(AUDIT_PAGE_SIZE),
});
export type AuditQuery = z.input<typeof auditQuerySchema>;

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  /** Pass as `cursor` for older entries; null when this was the last page. */
  nextCursor: z.string().nullable(),
  /** Every account that appears in the log (for the person filter), by name. */
  people: z.array(z.object({ userId: z.string(), name: z.string() })),
  /** The action keys in the log (for the action filter), sorted. */
  actions: z.array(z.string()),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

/** `alarm.armed_home` → `alarm`: the part filters group on. */
export const auditDomainOf = (action: string) => action.split(".")[0] ?? action;
