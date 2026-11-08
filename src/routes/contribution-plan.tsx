import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ContributionPlanScreen, contributionPlanLoader, contributionPlanAction, canManageMoney } from "@/features/money";
import { screenHandle } from "@/lib/screen-context";
export const loader = contributionPlanLoader;
export const action = contributionPlanAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "contribution_plan", id: data.plan.id, label: data.habitants.find((person) => person.id === data.plan.habitantId)?.name ?? data.plan.id }));
export function Component() { const page = useLoaderData<typeof loader>(); return <ContributionPlanScreen key={page.plan.id} {...page} canManage={canManageMoney(useCurrentUser().role)} />; }
