import { FolderKanbanIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { useSamePagePending } from "@/lib/pending";
import { ProjectFormDialog } from "../components/project-form-dialog";
import { ProjectListItem } from "../components/project-list-item";
import { ProjectTile } from "../components/project-tile";
import { isRunning, type Project, type ProjectsOverview } from "../types/projects";

const FILTERS = ["running", "done", "cancelled", "all"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_PARAM = "status";

type PlaceOption = { id: string; name: string; color: string; icon: string | null };

type ProjectsScreenProps = {
  overview: ProjectsOverview;
  places: PlaceOption[];
  canManage: boolean;
};

const matches = (project: Project, filter: Filter) =>
  filter === "all" ? true : filter === "running" ? isRunning(project.status) : project.status === filter;

/** All projects as tiles (or a list), running ones by default, with their budget at a glance. */
export function ProjectsScreen({ overview, places, canManage }: ProjectsScreenProps) {
  const { t } = useTranslation("projects");
  const [searchParams, setSearchParams] = useSearchParams();
  const pending = useSamePagePending();
  const requested = searchParams.get(FILTER_PARAM);
  const filter: Filter = (FILTERS as readonly string[]).includes(requested ?? "") ? (requested as Filter) : "running";
  const visible = overview.projects.filter((project) => matches(project, filter));

  const setFilter = (next: Filter) =>
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next === "running") params.delete(FILTER_PARAM);
        else params.set(FILTER_PARAM, next);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  const addButton = canManage && (
    <ProjectFormDialog
      places={places}
      tags={overview.tags}
      trigger={
        <Button>
          <PlusIcon />
          {t("actions.add")}
        </Button>
      }
    />
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={addButton} />
      <GeneralList
        label={t("page.title")}
        items={visible}
        getKey={(project) => project.id}
        renderRow={(project) => <ProjectListItem project={project} />}
        renderTile={(project) => <ProjectTile project={project} />}
        search={{
          keys: (project) => [project.name, project.tag, project.description, ...project.places.map((place) => place.name)],
          label: t("filter.search"),
          placeholder: t("filter.search"),
        }}
        storageKey="projects"
        defaultView="tiles"
        pending={pending}
        filtered={filter !== "all" && overview.projects.length > 0}
        toolbar={
          <SegmentedControl<Filter>
            label={t("filter.status")}
            size="sm"
            options={FILTERS.map((value) => ({ value, label: t(`filter.${value}`) }))}
            value={filter}
            onChange={setFilter}
            className="self-start"
          />
        }
        emptyState={<EmptyState icon={FolderKanbanIcon} title={t("empty.title")} description={t("empty.description")} action={addButton} />}
      />
    </PageContainer>
  );
}
