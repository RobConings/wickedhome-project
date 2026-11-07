import type { ContributionHistory } from "./money";

/** Keep cents signed: withdrawals and direct settlements adjust the person's contribution. */
export function groupContributionHistory(
  entries: readonly { date: string; accountId: string; habitantId: string | null; amountCents: number }[],
  today: string,
): ContributionHistory {
  const groups = new Map<string, ContributionHistory["rows"][number]>();
  for (const entry of entries) {
    if (entry.date > today) continue;
    const month = entry.date.slice(0, 7);
    const key = JSON.stringify([month, entry.accountId, entry.habitantId]);
    const row = groups.get(key) ?? { month, accountId: entry.accountId, habitantId: entry.habitantId, amountCents: 0 };
    row.amountCents += entry.amountCents;
    groups.set(key, row);
  }
  return { today, rows: [...groups.values()].sort((a, b) => b.month.localeCompare(a.month)) };
}
