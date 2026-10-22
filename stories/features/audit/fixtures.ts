import type { AuditClient } from "@/features/audit";
import type { AuditEntry, AuditPage, AuditQuery } from "@/features/audit/types/audit";

/** Times relative to when Storybook loads. */
const HOUR = 3_600_000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();

let sequence = 0;
const entry = (hoursAgo: number, overrides: Partial<AuditEntry> & Pick<AuditEntry, "action">): AuditEntry => ({
  id: `audit-${(sequence += 1)}`,
  at: at(hoursAgo),
  channel: "app",
  userId: "user-rob",
  actorName: "Rob",
  targetType: null,
  targetId: null,
  targetLabel: null,
  summary: null,
  ...overrides,
});

export const armedEntry = entry(0.2, { action: "alarm.armed_away", targetType: "alarm", targetLabel: "alarm_control_panel.verisure" });
export const assistantEntry = entry(1, { action: "tasks.complete", channel: "assistant", targetType: "tasks", summary: "Mark “Bins out” done" });
export const mcpEntry = entry(3, { action: "shopping.add_item", channel: "mcp", userId: "user-clara", actorName: "Clara", targetType: "shopping", summary: "Add 2 × milk to the shopping list" });
export const correctedEntry = entry(5, { action: "payment_account.corrected", targetType: "payment_account", targetLabel: "Joint account", summary: "2026-10-03: set to € 8.000,00 (+€ 123,45)" });
export const jobEntry = entry(9, { action: "expense.auto_paid", channel: "job", userId: null, actorName: "expenses.auto-pay", targetType: "expense", targetLabel: "Fluvius", summary: "Direct debit due 2026-10-03" });
export const failedEntry = entry(20, { action: "alarm.attempt_failed", userId: "user-clara", actorName: "Clara", targetType: "alarm", summary: "disarm failed: Invalid alarm code" });
export const roleEntry = entry(26, { action: "account.role_changed", targetType: "account", targetLabel: "Lotte", summary: "Role: adult → child" });
export const inviteEntry = entry(30, { action: "invite.created", targetType: "invite", targetLabel: "Clara", summary: "Role: adult" });
export const acceptedEntry = entry(31, { action: "invite.accepted", userId: "user-clara", actorName: "Clara", targetType: "invite", targetLabel: "Clara", summary: "Role: adult" });
export const disabledEntry = entry(50, { action: "account.disabled", targetType: "account", targetLabel: "Guest" });
export const loggedEntry = entry(70, { action: "expenses.log", channel: "assistant", targetType: "expenses", summary: "Log € 54,20 groceries at Delhaize, paid by card" });

export const auditEntriesFixture: AuditEntry[] = [armedEntry, assistantEntry, mcpEntry, correctedEntry, jobEntry, failedEntry, roleEntry, inviteEntry, acceptedEntry, disabledEntry, loggedEntry];

const matches = (item: AuditEntry, query: AuditQuery) => {
  if (query.channel && item.channel !== query.channel) return false;
  if (query.userId && item.userId !== query.userId) return false;
  if (query.action && !(query.action.endsWith(".") ? item.action.startsWith(query.action) : item.action === query.action)) return false;
  const text = [item.actorName, item.action, item.targetLabel, item.summary].join(" ").toLowerCase();
  return (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
};

/** An in-memory API: filters and search like the server, pages of `pageSize`. */
export function fakeAuditClient(entries: AuditEntry[] = auditEntriesFixture, options: { delayMs?: number; fail?: boolean; pageSize?: number } = {}): AuditClient {
  const { delayMs = 300, fail = false, pageSize = 50 } = options;
  return {
    list: (query) =>
      new Promise<AuditPage>((resolve, reject) => {
        if (delayMs === Infinity) return;
        setTimeout(() => {
          if (fail) return reject(new Error("Network error"));
          const found = entries.filter((item) => matches(item, query));
          const start = query.cursor ? Number(query.cursor) : 0;
          const end = start + pageSize;
          const people = new Map(entries.flatMap((item) => (item.userId ? [[item.userId, item.actorName] as const] : [])));
          resolve({
            entries: found.slice(start, end),
            nextCursor: end < found.length ? String(end) : null,
            people: [...people].map(([userId, name]) => ({ userId, name })),
            actions: [...new Set(entries.map((item) => item.action))].sort(),
          });
        }, delayMs);
      }),
  };
}
