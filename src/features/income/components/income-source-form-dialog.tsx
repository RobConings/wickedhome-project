import * as React from "react";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { RecurrenceFields } from "@/components/shared/recurrence-fields";
import { HabitantAvatar, type Habitant } from "@/features/household";
import {
  AMOUNT_MODES,
  INCOME_RRULE_SUPPORT,
  JOINT,
  NO_ACCOUNT,
  SOURCE_KINDS,
  incomeSourceCreateSchema,
  incomeSourceUpdateSchema,
  type IncomeSource,
  type IncomeTargetAccount,
} from "../types/income";
import { earners } from "./use-income-text";
import { dateText, money } from "@/lib/locale-text";

type IncomeSourceFormDialogProps = {
  trigger?: React.ReactElement;
  habitants: Habitant[];
  accounts: IncomeTargetAccount[];
  today: string;
  /** Edit this source; leave out to add one. */
  source?: IncomeSource;
  /** Preselected person when adding. */
  defaultHabitantId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** The amount history of a fixed source, with a remove button per entry (the last one stays). */
function AmountHistory({ source }: { source: IncomeSource }) {
  const { t } = useTranslation("income");
  const fetcher = useFetcher();
  if (source.amountMode !== "fixed" || source.amounts.length === 0) return null;
  const removing = fetcher.state !== "idle" ? fetcher.formData?.get("amountId") : null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <span className="text-sm font-semibold">{t("sources.history")}</span>
      <ul className="flex flex-col divide-y text-sm">
        {[...source.amounts].reverse().map((amount) => (
          <li key={amount.id} className="flex min-h-10 items-center gap-2">
            <span className="flex-1">{t("sources.amountFrom", { date: dateText(amount.effectiveFrom), amount: money(amount.amountCents) })}</span>
            {source.amounts.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("actions.removeAmount")}
                loading={removing === amount.id}
                onClick={() => fetcher.submit({ intent: "delete-amount", id: source.id, amountId: amount.id }, { method: "post" })}
              >
                <XIcon />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Add or edit a recurring income: who, kind, schedule, and a fixed amount (with history) or a variable one. */
export function IncomeSourceFormDialog({
  trigger,
  habitants,
  accounts,
  today,
  source,
  defaultHabitantId,
  open,
  onOpenChange,
}: IncomeSourceFormDialogProps) {
  const { t } = useTranslation("income");
  const isEdit = Boolean(source);
  const hasHistory = (source?.amounts.length ?? 0) > 0;

  const whoOptions = [
    { value: JOINT, label: t("who.joint") },
    ...earners(habitants).map((habitant) => ({
      value: habitant.id,
      label: habitant.name,
      icon: <HabitantAvatar habitant={habitant} size="sm" className="size-5" />,
    })),
  ];
  const fields: GeneralFormField[] = [
    { name: "habitantId", type: "select", label: t("fields.who"), options: whoOptions, span: "half" },
    {
      name: "kind",
      type: "select",
      label: t("fields.kind"),
      options: SOURCE_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) })),
      span: "half",
    },
    { name: "name", type: "text", label: t("fields.name"), placeholder: t("fields.namePlaceholder"), maxLength: 80 },
    {
      name: "amountMode",
      type: "select",
      label: t("fields.amountMode"),
      options: AMOUNT_MODES.map((mode) => ({ value: mode, label: t(`modes.${mode}`) })),
    },
    {
      name: "amountCents",
      type: "money",
      label: t("fields.amount"),
      span: "half",
      optional: isEdit,
      when: (values) => values.amountMode === "fixed",
    },
    {
      name: "amountFrom",
      type: "date",
      label: t("fields.amountFrom"),
      description: t("fields.amountFromDescription"),
      span: "half",
      when: (values) => isEdit && hasHistory && values.amountMode === "fixed",
    },
    {
      name: "estimateCents",
      type: "money",
      label: t("fields.estimate"),
      description: t("fields.estimateDescription"),
      when: (values) => values.amountMode === "variable",
    },
    { name: "startDate", type: "date", label: t("fields.startDate"), span: "half" },
    { name: "endDate", type: "date", label: t("fields.endDate"), span: "half" },
    {
      name: "rrule",
      type: "custom",
      label: t("fields.repeat"),
      render: ({ id, name, values, errors }) => (
        <RecurrenceFields
          id={id}
          name={name}
          defaultValue={source?.rrule ?? "FREQ=MONTHLY"}
          startDate={typeof values.startDate === "string" && values.startDate ? values.startDate : today}
          frequencies={INCOME_RRULE_SUPPORT.frequencies}
          weekdays={false}
          seasons={false}
          allowNone={false}
          errors={errors}
        />
      ),
    },
    ...(accounts.length > 0
      ? [
          {
            name: "targetAccountId",
            type: "select" as const,
            label: t("fields.targetAccount"),
            description: t("fields.targetAccountDescription"),
            options: [{ value: NO_ACCOUNT, label: t("fields.noAccount") }, ...accounts.map((account) => ({ value: account.id, label: account.name }))],
          },
        ]
      : []),
    { name: "notes", type: "textarea", label: t("fields.notes"), rows: 2, maxLength: 2000 },
  ];

  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("form.editSourceTitle") : t("form.createSourceTitle")}
      schema={isEdit ? incomeSourceUpdateSchema : incomeSourceCreateSchema}
      intent={isEdit ? "update-source" : "create-source"}
      hiddenFields={{ id: source?.id }}
      intro={source ? <AmountHistory source={source} /> : undefined}
      defaultValues={{
        habitantId: source ? (source.habitantId ?? JOINT) : (defaultHabitantId ?? JOINT),
        kind: source?.kind ?? "salary",
        name: source?.name ?? "",
        amountMode: source?.amountMode ?? "fixed",
        amountCents: source?.amountMode === "fixed" ? source.currentAmountCents : null,
        amountFrom: today,
        estimateCents: source?.estimateCents ?? null,
        startDate: source?.startDate ?? today,
        endDate: source?.endDate ?? "",
        targetAccountId: source?.targetAccountId ?? NO_ACCOUNT,
        notes: source?.notes ?? "",
      }}
      fields={fields}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={isEdit ? t("form.sourceSaved") : t("form.sourceCreated")}
    />
  );
}
