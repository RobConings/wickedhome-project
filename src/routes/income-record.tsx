import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { incomeRecordLoader, incomeRecordAction, IncomeRecordScreen, canManageIncome } from "@/features/income";
import { screenHandle } from "@/lib/screen-context";
export const loader = incomeRecordLoader;
export const action = incomeRecordAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "income_receipt", id: data.income.id, label: data.income.description ?? data.source?.name ?? data.income.kind }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <IncomeRecordScreen {...data} canManage={canManageIncome(user.role)} />;
}
