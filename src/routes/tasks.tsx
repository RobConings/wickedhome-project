import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DeviceFormField } from "@/features/devices";
import { ProjectFormField } from "@/features/projects";
import { TasksScreen, canManageTasks, tasksAction, tasksLoader, tasksShouldRevalidate } from "@/features/tasks";
import { screenHandle } from "@/lib/screen-context";

export const loader = tasksLoader;
export const action = tasksAction;
export const handle = screenHandle(({ t }) => ({ kind: "tasks", label: t("nav.tasks") }));
export const shouldRevalidate = tasksShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  const { overview, habitants, places } = useLoaderData<typeof tasksLoader>();
  return (
    <TasksScreen
      overview={overview}
      habitants={habitants}
      places={places}
      canManage={canManageTasks(user.role)}
      currentHabitantId={user.habitantId}
      deviceField={({ defaultValue, errors }) => <DeviceFormField defaultValue={defaultValue} errors={errors} />}
      projectField={({ defaultValue }) => <ProjectFormField defaultValue={defaultValue} />}
    />
  );
}
