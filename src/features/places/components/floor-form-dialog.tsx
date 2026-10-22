import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { PlacesActionResult } from "../data/places-loaders";
import { FLOOR_KINDS, floorInputSchema, type Floor } from "../types/places";

type FloorFormDialogProps = {
  /** Edit this floor; omit to create a new one. */
  floor?: Floor;
  /** Kind preselected for a new floor. */
  defaultKind?: Floor["kind"];
  trigger: React.ReactElement;
};

export function FloorFormDialog({ floor, defaultKind = "indoor", trigger }: FloorFormDialogProps) {
  const { t } = useTranslation("places");
  const isEdit = Boolean(floor);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), placeholder: t("floor.form.namePlaceholder") },
    {
      name: "kind",
      type: "select",
      label: t("fields.kind"),
      span: "half",
      options: FLOOR_KINDS.map((kind) => ({ value: kind, label: t(`floorKinds.${kind}`) })),
    },
    {
      name: "level",
      type: "number",
      label: t("fields.level"),
      description: t("floor.form.levelHelp"),
      span: "half",
      min: -10,
      max: 50,
      step: 1,
      inputMode: "numeric",
    },
  ];

  return (
    <GeneralFormDialog<PlacesActionResult>
      trigger={trigger}
      title={isEdit ? t("floor.form.editTitle") : t("floor.form.createTitle")}
      description={t("floor.form.description")}
      successMessage={isEdit ? t("floor.form.updated") : t("floor.form.created")}
      schema={floorInputSchema}
      fields={fields}
      intent={isEdit ? "update-floor" : "create-floor"}
      hiddenFields={{ id: floor?.id }}
      defaultValues={{ name: floor?.name ?? "", kind: floor?.kind ?? defaultKind, level: floor?.level ?? 0 }}
      contentClassName="sm:max-w-md"
    />
  );
}
