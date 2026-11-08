import { FolderKanbanIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GeneralList } from "@/components/shared/general-list";
import { EmptyState } from "@/components/shared/empty-state";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchProjects } from "../data/projects-requests";
import type { Project } from "../types/projects";
import { ProjectListItem } from "./project-list-item";
import { ProjectTile } from "./project-tile";

/** Projects contributes existing room associations without copying project state into Places. */
export function PlaceProjectsSection({ placeId, initialProjects }: { placeId: string; initialProjects?: Project[] }) {
  const { t } = useTranslation("projects");
  const resource = useAsyncResource(`room-projects:${placeId}`, () => fetchProjects().then((result) => result.projects), { initial: initialProjects });
  return <GeneralList search={{ keys: ["name"] }} label={t("page.title")} items={(resource.data ?? []).filter((project) => project.places.some((place) => place.id === placeId))}
    getKey={(project) => project.id} renderRow={(project) => <ProjectListItem project={project} />} renderTile={(project) => <ProjectTile project={project} />}
    storageKey="room-projects" loading={resource.loading} error={resource.error} onRetry={resource.refresh}
    emptyState={<EmptyState icon={FolderKanbanIcon} title={t("room.empty")} />} />;
}
