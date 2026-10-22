import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { NextToPay, fetchUnpaidExpenses, type Expense } from "@/features/expenses";
import { VoucherBalances } from "@/features/income";
import { MoneyFlowScreen, canManageMoney, fetchMoneyLoans, fetchMoneyTimeline, moneyAction, moneyLoader } from "@/features/money";
import { ProjectBudgetsCard, fetchProjectBudgetsSummary } from "@/features/projects";
import { screenHandle } from "@/lib/screen-context";

/**
 * The money flow plus "Next to pay" from the expenses feature; a failing request there only hides that card.
 * The month's project budgets, the loans and the income/expenses timeline load in the background (not
 * awaited); a failure only empties that card.
 */
export async function loader(args: LoaderFunctionArgs) {
  const [page, unpaid] = await Promise.all([moneyLoader(args), fetchUnpaidExpenses().catch(() => null as Expense[] | null)]);
  const projects = fetchProjectBudgetsSummary(page.month.month).catch(() => null);
  const loans = fetchMoneyLoans().catch(() => null);
  const timeline = fetchMoneyTimeline().catch(() => null);
  return { ...page, unpaid, projects, loans, timeline };
}

export const action = moneyAction;
export const handle = screenHandle(({ t }) => ({ kind: "money", label: t("nav.money") }));

export function Component() {
  const user = useCurrentUser();
  const { month, habitants, unpaid, projects, loans, timeline } = useLoaderData<typeof loader>();
  return (
    <MoneyFlowScreen
      data={month}
      habitants={habitants}
      canManage={canManageMoney(user.role)}
      nextToPay={unpaid && unpaid.length > 0 ? <NextToPay unpaid={unpaid} habitants={habitants} today={month.today} /> : undefined}
      vouchers={<VoucherBalances balances={month.vouchers} habitants={habitants} />}
      projects={<ProjectBudgetsCard data={projects} />}
      loans={loans}
      timeline={timeline}
    />
  );
}
