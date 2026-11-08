import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { HabitantDetailScreen, habitantDetailAction, habitantDetailLoader, canManageHabitants } from "@/features/household";
import { HabitantTasksPanel } from "@/features/tasks";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
export const loader = habitantDetailLoader;
export const action = habitantDetailAction;
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  return <HabitantDetailScreen key={data.habitant.id} {...data} canManage={canManageHabitants(user.role)} tasks={<HabitantTasksPanel assigneeId={data.habitant.id} />} attachments={<DocumentAttachments entityType="habitant" entityId={data.habitant.id} canManage={canManageDocuments(user.role)} />} />;
}
