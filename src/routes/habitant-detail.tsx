import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HabitantDetailScreen, habitantDetailAction, habitantDetailLoader, canManageHabitants } from "@/features/household";
import { HabitantTasksPanel } from "@/features/tasks";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { HabitantMoneyPanel, canManageMoney } from "@/features/money";
import { screenHandle } from "@/lib/screen-context";
export const loader = habitantDetailLoader;
export const action = habitantDetailAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "habitant", id: data.habitant.id, label: data.habitant.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <HabitantDetailScreen key={data.habitant.id} {...data} canManage={canManageHabitants(user.role)} finance={canManageMoney(user.role) && data.habitant.type !== "pet" ? <HabitantMoneyPanel habitantId={data.habitant.id} /> : undefined} tasks={<HabitantTasksPanel assigneeId={data.habitant.id} />} attachments={<DocumentAttachments entityType="habitant" entityId={data.habitant.id} canManage={canManageDocuments(user.role)} />} />;
}
