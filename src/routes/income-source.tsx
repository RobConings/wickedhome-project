import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { incomeSourceLoader, incomeRecordAction, IncomeSourceScreen, canManageIncome } from "@/features/income";
import { screenHandle } from "@/lib/screen-context";
export const loader = incomeSourceLoader;
export const action = incomeRecordAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "income_source", id: data.detail.source.id, label: data.detail.source.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <IncomeSourceScreen {...data} canManage={canManageIncome(user.role)} />;
}
