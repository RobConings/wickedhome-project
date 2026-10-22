import type * as React from "react";
import { LandmarkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GeneralFormValues } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { recordTransferSchema, type JointAccount } from "../types/money";
import { dateText, people } from "./use-money-text";

export type TransferDefaults = {
  /** `habitant:<id>` or `account:<id>`. */
  from?: string;
  toAccountId?: string;
  amountCents?: number | null;
  date?: string;
};

type RecordTransferDialogProps = {
  trigger?: React.ReactElement;
  accounts: JointAccount[];
  habitants: Habitant[];
  today: string;
  /** Prefill, e.g. from a contribution plan (who, account, what is still to go, the planned day). */
  defaults?: TransferDefaults;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * "Record transfer": who transferred what into a joint account (a contribution), or a transfer between the
 * joint accounts (joint ↔ savings).
 */
export function RecordTransferDialog({ trigger, accounts, habitants, today, defaults, open, onOpenChange }: RecordTransferDialogProps) {
  const { t } = useTranslation("money");
  const active = accounts.filter((account) => !account.archived);
  const fromOptions = [
    ...people(habitants).map((habitant) => ({
      value: `habitant:${habitant.id}`,
      label: habitant.name,
      icon: <HabitantAvatar habitant={habitant} size="sm" className="size-5" />,
    })),
    ...active.map((account) => ({ value: `account:${account.id}`, label: account.name, icon: <LandmarkIcon className="size-4" /> })),
  ];
  const toOptions = active.map((account) => ({ value: account.id, label: account.name }));
  const defaultTo = defaults?.toAccountId ?? active.find((account) => account.kind === "joint")?.id ?? active[0]?.id ?? "";

  /** On or before the receiving account's last real balance: explain what that means for the balance. */
  const correctionHint = (values: GeneralFormValues): string | null => {
    const last = accounts.find((account) => account.id === values.toAccountId)?.lastCorrection?.date;
    const date = typeof values.date === "string" ? values.date : "";
    if (!last || !date || date > last) return null;
    return date < last ? t("form.beforeCorrection", { date: dateText(last) }) : t("form.onCorrectionDay", { date: dateText(last) });
  };

  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.transferTitle")}
      description={t("form.transferDescription")}
      schema={recordTransferSchema}
      intent="record-transfer"
      defaultValues={{
        from: defaults?.from ?? fromOptions[0]?.value ?? "",
        toAccountId: defaultTo,
        amountCents: defaults?.amountCents ?? null,
        date: defaults?.date && defaults.date <= today ? defaults.date : today,
        note: "",
      }}
      fields={[
        { name: "from", type: "select", label: t("fields.from"), options: fromOptions, span: "half" },
        { name: "toAccountId", type: "select", label: t("fields.to"), options: toOptions, span: "half" },
        { name: "amountCents", type: "money", label: t("fields.amount"), span: "half", autoFocus: true },
        { name: "date", type: "date", label: t("fields.date"), span: "half" },
        {
          name: "correctionHint",
          type: "custom",
          label: t("fields.date"),
          bare: true,
          when: (values) => correctionHint(values) !== null,
          render: ({ values }) => <InlineAlert tone="info">{correctionHint(values)}</InlineAlert>,
        },
        { name: "note", type: "text", label: t("fields.note"), maxLength: 300 },
      ]}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={t("form.transferSaved")}
    />
  );
}
