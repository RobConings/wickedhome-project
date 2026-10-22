import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker, type EntityPickerItem } from "./entity-picker";
import { FormField } from "./form-field";
import { useSelections, type UseSelectionsOptions } from "@/lib/selections";
import { fetchProjects } from "../data/projects-requests";
import { isRunning, type Project } from "../types/projects";
import { ProjectAvatar } from "./project-icon";

type PickerProject = Pick<Project, "id" | "name" | "icon" | "color" | "status" | "tag">;

type ProjectPickerProps = Omit<
  React.ComponentProps<typeof EntityPicker>,
  "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"
> & {
  /** Projects to choose from; loaded by the picker itself when left out. */
  projects?: PickerProject[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/** Running projects, then done ones; a project chosen before stays visible whatever its status. */
const choosable = (projects: PickerProject[], selected: string | null | undefined) =>
  projects.filter((project) => isRunning(project.status) || project.id === selected || project.status === "done");

let cache: Promise<PickerProject[]> | null = null;
/** The projects, fetched once per page load and shared by every picker on the page. */
function loadProjects(): Promise<PickerProject[]> {
  cache ??= fetchProjects()
    .then((overview) => overview.projects)
    .catch((error: unknown) => {
      cache = null;
      throw error;
    });
  return cache;
}

/**
 * Choose a project, with the user's favourite and recently used projects on top. Works in a `<Form>` via
 * `name`. Picking one records it as recently used.
 */
export function ProjectPicker({ projects: given, initialSelections, placeholder, loading, onChange, value, defaultValue, ...props }: ProjectPickerProps) {
  const { t } = useTranslation("projects");
  const selections = useSelections("project", initialSelections ? { initial: initialSelections } : undefined);
  const [loaded, setLoaded] = React.useState<PickerProject[] | null>(given ?? null);

  React.useEffect(() => {
    if (given) return;
    let cancelled = false;
    loadProjects()
      .then((projects) => !cancelled && setLoaded(projects))
      .catch(() => !cancelled && setLoaded([]));
    return () => {
      cancelled = true;
    };
  }, [given]);

  const projects = React.useMemo(() => given ?? loaded ?? [], [given, loaded]);
  const items = React.useMemo<EntityPickerItem[]>(
    () =>
      choosable(projects, value ?? defaultValue).map((project) => ({
        id: project.id,
        label: project.name,
        description: [project.tag, t(`status.${project.status}`)].filter(Boolean).join(" · "),
        leading: <ProjectAvatar project={project} size="sm" className="size-6 rounded-md [&_svg]:size-3.5" />,
        keywords: project.tag ? [project.tag] : undefined,
      })),
    [projects, t, value, defaultValue],
  );

  return (
    <EntityPicker
      {...props}
      value={value}
      defaultValue={defaultValue}
      items={items}
      favoriteIds={selections.favoriteIds}
      recentIds={selections.recentIds}
      loading={loading || selections.loading || (!given && loaded === null)}
      onToggleFavorite={(id) => selections.toggleFavorite(id).catch(() => toast.error(t("favorite.failed")))}
      onChange={(id) => {
        if (id) void selections.recordUse(id).catch(() => undefined);
        return onChange?.(id);
      }}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}

type ProjectFormFieldProps = {
  /** The project the record has now. */
  defaultValue?: string | null;
  /** Form field name; `projectId` by default. */
  name?: string;
  id?: string;
  errors?: string[];
  description?: React.ReactNode;
  /** Seed data (stories). */
  projects?: PickerProject[];
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * The "Project (optional)" field other features' forms get through their `projectField` slot (composed in the
 * route). Clearing it posts an empty `projectId`, which removes the project.
 */
export function ProjectFormField({ defaultValue = null, name = "projectId", id, errors, description, projects, initialSelections }: ProjectFormFieldProps) {
  const { t } = useTranslation("projects");
  const { t: tCommon } = useTranslation();
  const fallbackId = React.useId();
  const fieldId = id ?? fallbackId;
  return (
    <FormField label={t("picker.label")} htmlFor={fieldId} optionalLabel={tCommon("form.optional")} description={description} errors={errors}>
      <ProjectPicker id={fieldId} name={name} defaultValue={defaultValue} projects={projects} initialSelections={initialSelections} clearable />
    </FormField>
  );
}
