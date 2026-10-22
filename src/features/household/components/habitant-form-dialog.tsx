import type * as React from "react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "./general-form-dialog";
import type { GeneralFormField } from "./general-form";
import type { HabitantActionResult } from "../data/household-loaders";
import { HABITANT_COLORS, HABITANT_TYPES, habitantInputSchema, type Habitant } from "../types/household";
import { HabitantAvatar } from "./habitant-avatar";

type HabitantFormDialogProps = {
  /** Edit this habitant; omit to create a new one. */
  habitant?: Habitant;
  trigger: React.ReactElement;
};

export function HabitantFormDialog({ habitant, trigger }: HabitantFormDialogProps) {
  const { t } = useTranslation("household");
  const isEdit = Boolean(habitant);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name") },
    {
      name: "type",
      type: "select",
      label: t("fields.type"),
      options: HABITANT_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) })),
    },
    { name: "color", type: "color", label: t("fields.color"), colors: HABITANT_COLORS },
    { name: "emoji", type: "text", label: t("fields.emoji"), placeholder: "🐶", maxLength: 8, span: "half" },
    { name: "birthday", type: "date", label: t("fields.birthday"), span: "half" },
  ];

  return (
    <GeneralFormDialog<HabitantActionResult>
      trigger={trigger}
      title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      description={t("form.description")}
      media={(values) => (
        <HabitantAvatar
          habitant={{
            name: String(values.name ?? "") || "?",
            color: String(values.color ?? HABITANT_COLORS[0]),
            emoji: String(values.emoji ?? ""),
          }}
          size="lg"
        />
      )}
      successMessage={isEdit ? t("form.updated") : t("form.created")}
      schema={habitantInputSchema}
      fields={fields}
      intent={isEdit ? "update" : "create"}
      hiddenFields={{ id: habitant?.id }}
      defaultValues={{
        name: habitant?.name ?? "",
        type: habitant?.type ?? "adult",
        color: habitant?.color ?? HABITANT_COLORS[0],
        emoji: habitant?.emoji ?? "",
        birthday: habitant?.birthday ?? "",
      }}
      contentClassName="sm:max-w-md"
    />
  );
}
