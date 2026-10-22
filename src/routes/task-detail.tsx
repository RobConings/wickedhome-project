import { useLoaderData, useRevalidator } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { ProjectFormField } from "@/features/projects";
import { TaskMaterialsPanel } from "@/features/shopping";
import { TaskDetailScreen, canManageTasks, taskDetailLoader, tasksAction } from "@/features/tasks";
import { screenHandle } from "./lib/screen-context";

export const loader = taskDetailLoader;
export const action = tasksAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "task", id: data.detail.task.id, label: data.detail.task.title }));

export function Component() {
  const user = useCurrentUser();
  const { detail, habitants, places } = useLoaderData<typeof taskDetailLoader>();
  const revalidator = useRevalidator();
  const canManage = canManageTasks(user.role);
  return (
    <TaskDetailScreen
      detail={detail}
      habitants={habitants}
      places={places}
      canManage={canManage}
      currentHabitantId={user.habitantId}
      projectField={({ defaultValue }) => <ProjectFormField defaultValue={defaultValue} />}
      materials={
        <TaskMaterialsPanel
          taskId={detail.task.id}
          canManage={canManage}
          placeId={detail.task.place?.id ?? null}
          // Bought materials change the task's readiness.
          onChange={() => void revalidator.revalidate()}
        />
      }
      attachments={
        <DocumentAttachments
          key={detail.task.id}
          entityType="task"
          entityId={detail.task.id}
          canManage={canManageDocuments(user.role)}
        />
      }
    />
  );
}
