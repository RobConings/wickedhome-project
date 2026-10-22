import type { SessionUser } from "@/features/auth/types/auth";
import {
  AUDIT_RETENTION_DAYS,
  type auditQuerySchema,
  type AuditChannel,
  type AuditEntry,
  type AuditPage,
} from "@/features/audit/types/audit";
import type { z } from "zod";
import { db, type AuditChannel as AuditChannelRow, type Prisma } from "../lib/db";
import {
  auditCutoff,
  decodeAuditCursor,
  encodeAuditCursor,
  searchWords,
  toAuditRow,
  type AuditActor,
  type AuditRecord,
} from "./audit-entry";

export type { AuditActor, AuditRecord } from "./audit-entry";

/**
 * The household audit log (docs/AUDIT.md). Features call `audit(actor, record)` after a change succeeded:
 *
 *   await audit(appActor(currentUser(req)), { action: "account.disabled", targetType: "account", targetId: id, targetLabel: name });
 *
 * Writing never throws (a failed write is logged to the console), so auditing can't break the action itself.
 * Assistant and MCP writes are recorded in one place, the tool runner (ai/core/assistant-loop.ts).
 */

const CHANNEL_ROW: Record<AuditChannel, AuditChannelRow> = { app: "APP", assistant: "ASSISTANT", mcp: "MCP", job: "JOB" };

/** The signed-in person acting in the app. */
export const appActor = (user: SessionUser): AuditActor => ({ householdId: user.householdId, userId: user.id, name: user.name, channel: "app" });

/** A scheduled job acting for a household; the job id is the name. */
export const jobActor = (householdId: string, jobId: string): AuditActor => ({ householdId, userId: null, name: jobId, channel: "job" });

export async function audit(actor: AuditActor, record: AuditRecord): Promise<void> {
  try {
    const row = toAuditRow(actor, record);
    await db.auditEntry.create({ data: { ...row, channel: CHANNEL_ROW[row.channel] } });
  } catch (error) {
    console.error(`[audit] could not record ${record.action}`, error);
  }
}

type Row = Prisma.AuditEntryGetPayload<object>;

const toEntry = (row: Row): AuditEntry => ({
  id: row.id,
  at: row.createdAt.toISOString(),
  channel: row.channel.toLowerCase() as AuditChannel,
  userId: row.userId,
  actorName: row.actorName,
  action: row.action,
  targetType: row.targetType,
  targetId: row.targetId,
  targetLabel: row.targetLabel,
  summary: row.summary,
});

const TEXT_FIELDS = ["actorName", "action", "targetLabel", "summary"] as const;

/** One page of the household's log, newest first, with what the filters can offer. */
export async function listAuditEntries(householdId: string, query: z.output<typeof auditQuerySchema>): Promise<AuditPage> {
  const cursor = decodeAuditCursor(query.cursor);
  const and: Prisma.AuditEntryWhereInput[] = [{ householdId }];
  if (query.channel) and.push({ channel: CHANNEL_ROW[query.channel] });
  if (query.userId) and.push({ userId: query.userId });
  if (query.action) and.push(query.action.endsWith(".") ? { action: { startsWith: query.action } } : { action: query.action });
  for (const word of searchWords(query.q)) {
    and.push({ OR: TEXT_FIELDS.map((field) => ({ [field]: { contains: word, mode: "insensitive" as const } })) });
  }
  if (cursor) {
    and.push({ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] });
  }

  const rows = await db.auditEntry.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const people = await db.auditEntry.findMany({
    where: { householdId, userId: { not: null } },
    distinct: ["userId"],
    orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
    select: { userId: true, actorName: true },
  });
  const actions = await db.auditEntry.findMany({ where: { householdId }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    entries: page.map(toEntry),
    nextCursor: rows.length > query.limit && last ? encodeAuditCursor(last.createdAt, last.id) : null,
    people: people
      .flatMap((row) => (row.userId ? [{ userId: row.userId, name: row.actorName }] : []))
      .sort((a, b) => a.name.localeCompare(b.name)),
    actions: actions.map((row) => row.action),
  };
}

/** Deletes entries older than the retention (every household). */
export async function pruneAuditEntries(now = new Date(), retentionDays = AUDIT_RETENTION_DAYS): Promise<number> {
  const { count } = await db.auditEntry.deleteMany({ where: { createdAt: { lt: auditCutoff(now, retentionDays) } } });
  return count;
}
