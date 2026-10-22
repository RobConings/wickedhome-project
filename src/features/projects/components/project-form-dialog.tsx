import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { GeneralFormDialog } from "./general-form-dialog";
import type { GeneralFormField } from "./general-form";
import type { ProjectActionResult } from "../data/projects-loaders";
import {
  PROJECT_COLORS,
  PROJECT_ERROR_CODES,
  PROJECT_STATUSES,
  projectFormSchema,
  projectPath,
  toProjectIcon,
  type Project,
  type ProjectStatus,
} from "../types/projects";
import { ProjectIconPicker, ProjectPlacesField, ProjectTagField } from "./project-form-fields";
import { ProjectAvatar } from "./project-icon";

type PlaceOption = { id: string; name: string; color: string; icon: string | null };

type ProjectFormDialogProps = {
  /** Edit this project; omit to create one. */
  project?: Project;
  places: PlaceOption[];
  /** Tags the household already uses, offered first. */
  tags?: string[];
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Route that handles the form; defaults to the current one. */
  action?: string;
};

/** Add or edit a project: name, icon and colour, tag, places, dates, budget and status. Opens the new project after creating it. */
export function ProjectFormDialog({ project, places, tags, trigger, open, onOpenChange, action }: ProjectFormDialogProps) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  const isEdit = Boolean(project);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), placeholder: t("placeholders.name"), maxLength: 80, autoFocus: !isEdit },
    {
      name: "tag",
      type: "custom",
      label: t("fields.tag"),
      description: t("hints.tag"),
      render: ({ id, name, value, setValue, disabled }) => (
        <ProjectTagField id={id} name={name} value={String(value ?? "")} onChange={setValue} ownTags={tags} disabled={disabled} />
      ),
    },
    { name: "budgetCents", type: "money", label: t("fields.budget"), description: t("hints.budget"), span: "half" },
    {
      name: "status",
      type: "select",
      label: t("fields.status"),
      span: "half",
      options: PROJECT_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) })),
    },
    { name: "startDate", type: "date", label: t("fields.startDate"), span: "half" },
    { name: "endDate", type: "date", label: t("fields.endDate"), span: "half" },
    {
      name: "placeIds",
      type: "custom",
      label: t("fields.places"),
      description: t("hints.places"),
      optional: true,
      render: ({ id, name, value, setValue, disabled }) => (
        <ProjectPlacesField
          id={id}
          name={name}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={setValue}
          places={places}
          disabled={disabled}
        />
      ),
    },
    {
      name: "icon",
      type: "custom",
      label: t("fields.icon"),
      optional: true,
      render: ({ id, name, value, setValue, values, disabled }) => (
        <ProjectIconPicker id={id} name={name} value={toProjectIcon(value)} onChange={setValue} color={String(values.color ?? PROJECT_COLORS[0])} disabled={disabled} />
      ),
    },
    { name: "color", type: "color", label: t("fields.color"), colors: PROJECT_COLORS },
    { name: "description", type: "textarea", rows: 3, label: t("fields.description"), maxLength: 2000 },
  ];

  return (
    <GeneralFormDialog<ProjectActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      action={action}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={t("form.description")}
      media={(values) => <ProjectAvatar project={{ icon: toProjectIcon(values.icon), color: String(values.color ?? PROJECT_COLORS[0]) }} size="md" />}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      schema={projectFormSchema}
      fields={fields}
      intent={isEdit ? "update" : "create"}
      hiddenFields={{ id: project?.id }}
      translateError={(message) => ((PROJECT_ERROR_CODES as readonly string[]).includes(message) ? t(`errors.${message}`) : message)}
      onSuccess={(result) => {
        if (!isEdit && result.projectId) void navigate(projectPath(result.projectId));
      }}
      defaultValues={{
        name: project?.name ?? "",
        tag: project?.tag ?? "",
        budgetCents: project?.budgetCents ?? null,
        status: project?.status ?? ("active" satisfies ProjectStatus),
        startDate: project?.startDate ?? "",
        endDate: project?.endDate ?? "",
        placeIds: project?.places.map((place) => place.id) ?? [],
        icon: project?.icon ?? "folder",
        color: project?.color ?? PROJECT_COLORS[0],
        description: project?.description ?? "",
      }}
    />
  );
}
