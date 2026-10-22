import { contributionCoverage, personSettlement, settleContributions, type Coverage } from "@/features/money/types/contribution-settlement";
import type { AccountMonth, JointAccount, MoneyMonth } from "@/features/money/types/money";

/**
 * The money flow page's coverage card, as data: the same pure helpers (`contributionCoverage`,
 * `personSettlement`) fed exactly like `CoverageCard` feeds them (joint current accounts only, not savings or
 * archived ones; incomes per person; future-dated incomes on the joint accounts as `incoming`).
 */
export function monthCoverage(month: Pick<MoneyMonth, "month" | "today" | "accounts" | "accountMonths" | "contributions" | "jointCosts" | "income">): Coverage {
  const joint = month.accounts.filter((account) => account.kind === "joint" && !account.archived);
  const isJoint = (accountId: string) => joint.some((account) => account.id === accountId);
  return contributionCoverage({
    month: month.month,
    today: month.today,
    people: month.contributions.filter((row) => isJoint(row.accountId)).map(personSettlement),
    costs: month.jointCosts,
    balanceCents: joint.length > 0 ? joint.reduce((sum, account) => sum + account.balanceCents, 0) : null,
    incomes: month.income.people.filter((row) => row.key !== "joint").map((row) => ({ habitantId: row.key, cents: row.totalCents })),
    incoming: month.accountMonths
      .filter((item) => isJoint(item.accountId))
      .flatMap((item) => item.lines.filter((line) => line.type === "income" && line.future).map((line) => ({ date: line.date, amountCents: line.amountCents }))),
  });
}

/** The settlement of every account with contributions this month (who still transfers, takes back…). */
export const monthSettlements = (month: Pick<MoneyMonth, "contributions">) => settleContributions(month.contributions);

/** The balance an account had at the end of `date` according to the app (the month's lines, newest first). */
export function balanceOn(accountMonth: AccountMonth | undefined, date: string): number | null {
  if (!accountMonth) return null;
  const line = accountMonth.lines.find((item) => item.date <= date);
  return line ? line.balanceAfterCents : accountMonth.openingCents;
}

/** The default joint current account: marked default, else the first joint one (savings and archived left out). */
export function defaultAccount(accounts: readonly JointAccount[]): JointAccount | null {
  const joint = accounts.filter((account) => account.kind === "joint" && !account.archived);
  return joint.find((account) => account.isDefault) ?? joint[0] ?? null;
}
