import type { AuditChannel } from "@/features/audit/types/audit";

/**
 * The pure part of the audit log: who acted, how a record is cleaned up before it is stored, and the list's
 * cursor. No database here, so it is unit-tested directly (audit.test.ts).
 */

/** Who acted, and through which channel. */
export type AuditActor = {
  householdId: string;
  /** The account; null for jobs. */
  userId: string | null;
  /** Display name now (kept when the account is removed later); the job id for jobs. */
  name: string;
  channel: AuditChannel;
};

/** What happened. */
export type AuditRecord = {
  /** `<domain>.<verb>`: `account.role_changed`, `alarm.armed_away`, or an assistant tool's name. */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary?: string | null;
};

export type AuditRow = {
  householdId: string;
  userId: string | null;
  actorName: string;
  channel: AuditChannel;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string | null;
};

const LIMITS = { actorName: 120, action: 80, targetType: 40, targetId: 64, targetLabel: 200, summary: 500 } as const;

/**
 * Hides things that look like secrets, in case a caller passes them by mistake: MCP tokens, bearer tokens,
 * link tokens (43 base64url characters) and other long random strings, and `code`/`password` values.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bwh_mcp_[A-Za-z0-9_-]+/g, "•••")
    .replace(/\b(bearer)\s+\S+/gi, "$1 •••")
    .replace(/\b(code|password|pin|token|secret)(\s*[:=]\s*)\S+/gi, "$1$2•••")
    .replace(/[A-Za-z0-9_-]{32,}/g, "•••");
}

function clean(value: string | null | undefined, limit: number, redact = true): string | null {
  if (value === null || value === undefined) return null;
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  const safe = redact ? redactSecrets(oneLine) : oneLine;
  return safe.length > limit ? `${safe.slice(0, limit - 1)}…` : safe;
}

/** The row to store: one line per field, cut to the column's size, secrets hidden. Ids are kept as they are. */
export function toAuditRow(actor: AuditActor, record: AuditRecord): AuditRow {
  return {
    householdId: actor.householdId,
    userId: actor.userId,
    actorName: clean(actor.name, LIMITS.actorName) ?? "?",
    channel: actor.channel,
    action: clean(record.action, LIMITS.action, false) ?? "unknown",
    targetType: clean(record.targetType, LIMITS.targetType, false),
    targetId: clean(record.targetId, LIMITS.targetId, false),
    targetLabel: clean(record.targetLabel, LIMITS.targetLabel),
    summary: clean(record.summary, LIMITS.summary),
  };
}

/** Cursor of the list (newest first): the last entry's time and id. */
export const encodeAuditCursor = (createdAt: Date, id: string) => `${createdAt.toISOString()}|${id}`;

export function decodeAuditCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = cursor.split("|");
  const createdAt = at ? new Date(at) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

/** The words of a search; every word must match somewhere in the entry. */
export const searchWords = (q: string | undefined) => (q ?? "").split(/\s+/).filter(Boolean).slice(0, 6);

/** The oldest moment an entry is kept, for `retentionDays` (job `audit.prune`). */
export const auditCutoff = (now: Date, retentionDays: number) => new Date(now.getTime() - retentionDays * 86_400_000);
