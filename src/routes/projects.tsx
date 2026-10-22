import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ProjectsScreen, canManageProjects, projectsAction, projectsLoader } from "@/features/projects";
import { screenHandle } from "./lib/screen-context";

export const loader = projectsLoader;
export const action = projectsAction;
export const handle = screenHandle(({ t }) => ({ kind: "projects", label: t("nav.projects") }));

export function Component() {
  const user = useCurrentUser();
  const { overview, places } = useLoaderData<typeof projectsLoader>();
  return <ProjectsScreen overview={overview} places={places} canManage={canManageProjects(user.role)} />;
}
