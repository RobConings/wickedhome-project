import type * as React from "react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { HabitantAvatar, type Habitant } from "@/features/household";
import {
  JOINT,
  NO_ACCOUNT,
  ONE_OFF_KINDS,
  incomeInputSchema,
  type Income,
  type IncomeOccurrence,
  type IncomeTargetAccount,
} from "../types/income";
import { dateText, earners } from "./use-income-text";

type IncomeFormDialogProps = {
  trigger?: React.ReactElement;
  habitants: Habitant[];
  accounts: IncomeTargetAccount[];
  today: string;
  /** Edit this income. */
  income?: Income;
  /** Record the actual amount of this occurrence of a recurring income ("Enter this month's amount"). */
  occurrence?: IncomeOccurrence;
  /** Name of the recurring income when editing an income recorded for one. */
  sourceName?: string;
  defaultHabitantId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Record income: a one-off (tax return, green certificates, gift…), or the actual amount of one occurrence
 * of a recurring income, where only the amount, date, account and a note are asked.
 */
export function IncomeFormDialog({
  trigger,
  habitants,
  accounts,
  today,
  income,
  occurrence,
  sourceName,
  defaultHabitantId,
  open,
  onOpenChange,
}: IncomeFormDialogProps) {
  const { t } = useTranslation("income");
  const sourceId = occurrence?.sourceId ?? income?.sourceId ?? null;
  const periodDate = occurrence?.date ?? income?.periodDate ?? null;
  const forOccurrence = Boolean(sourceId);

  const accountField: GeneralFormField[] =
    accounts.length > 0
      ? [
          {
            name: "targetAccountId",
            type: "select",
            label: t("fields.targetAccount"),
            description: t("fields.targetAccountDescription"),
            options: [{ value: NO_ACCOUNT, label: t("fields.noAccount") }, ...accounts.map((account) => ({ value: account.id, label: account.name }))],
          },
        ]
      : [];

  const fields: GeneralFormField[] = [
    ...(forOccurrence
      ? []
      : ([
          {
            name: "habitantId",
            type: "select",
            label: t("fields.who"),
            span: "half",
            options: [
              { value: JOINT, label: t("who.joint") },
              ...earners(habitants).map((habitant) => ({
                value: habitant.id,
                label: habitant.name,
                icon: <HabitantAvatar habitant={habitant} size="sm" className="size-5" />,
              })),
            ],
          },
          {
            name: "kind",
            type: "select",
            label: t("fields.kind"),
            span: "half",
            options: ONE_OFF_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) })),
          },
          { name: "description", type: "text", label: t("fields.description"), placeholder: t("fields.descriptionPlaceholder"), maxLength: 120 },
        ] satisfies GeneralFormField[])),
    { name: "amountCents", type: "money", label: t("fields.amount"), span: "half", autoFocus: forOccurrence },
    { name: "date", type: "date", label: t("fields.date"), span: "half" },
    ...accountField,
    { name: "note", type: "textarea", label: t("fields.note"), rows: 2, maxLength: 2000 },
  ];

  const name = occurrence?.name ?? sourceName ?? "";
  const title = occurrence
    ? t("form.enterTitle", { name, date: dateText(occurrence.date) })
    : income
      ? t("form.editIncomeTitle")
      : t("form.createIncomeTitle");

  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={occurrence ? t("form.enterDescription") : undefined}
      schema={incomeInputSchema}
      intent={income ? "update-income" : "create-income"}
      hiddenFields={{
        id: income?.id,
        sourceId,
        periodDate,
        // Who and kind of an occurrence come from its recurring income (the API uses the source's).
        habitantId: forOccurrence ? (occurrence?.habitantId ?? income?.habitantId ?? JOINT) : undefined,
        kind: forOccurrence ? (occurrence?.kind ?? income?.kind) : undefined,
      }}
      defaultValues={{
        habitantId: income ? (income.habitantId ?? JOINT) : (defaultHabitantId ?? JOINT),
        kind: income?.kind ?? "tax_return",
        description: income?.description ?? "",
        amountCents: income?.amountCents ?? occurrence?.plannedCents ?? null,
        date: income?.date ?? (occurrence ? (occurrence.date <= today ? occurrence.date : today) : today),
        targetAccountId: income ? (income.targetAccountId ?? NO_ACCOUNT) : (occurrence?.targetAccountId ?? NO_ACCOUNT),
        note: income?.note ?? "",
      }}
      fields={fields}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={t("form.incomeSaved")}
    />
  );
}
