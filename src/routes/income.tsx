import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { IncomeScreen, canManageIncome, incomeAction, incomeLoader } from "@/features/income";
import { screenHandle } from "./lib/screen-context";

export const loader = incomeLoader;
export const action = incomeAction;
export const handle = screenHandle(({ t }) => ({ kind: "income", label: t("nav.income") }));

export function Component() {
  const user = useCurrentUser();
  const { overview, habitants } = useLoaderData<typeof incomeLoader>();
  return <IncomeScreen overview={overview} habitants={habitants} canManage={canManageIncome(user.role)} currentHabitantId={user.habitantId} />;
}
