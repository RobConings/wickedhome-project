import type * as React from "react";
import { useTranslation } from "react-i18next";
import { InlineAlert } from "@/components/shared/inline-alert";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { setBalanceSchema, type JointAccount } from "../types/money";
import { money } from "./use-money-text";

type SetBalanceDialogProps = {
  trigger?: React.ReactElement;
  account: JointAccount;
  today: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * "Set real balance": when the app's balance drifts from the bank, enter what the bank shows. The difference
 * is recorded as a correction in the history; no fake bills or incomes are needed.
 */
export function SetBalanceDialog({ trigger, account, today, open, onOpenChange }: SetBalanceDialogProps) {
  const { t } = useTranslation("money");
  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.setBalanceTitle", { name: account.name })}
      schema={setBalanceSchema}
      intent="set-balance"
      hiddenFields={{ id: account.id }}
      intro={
        <InlineAlert>
          {t("accounts.balance")}: <span className="font-semibold tabular-nums">{money(account.balanceCents)}</span>
        </InlineAlert>
      }
      defaultValues={{ date: today, balanceCents: null, negative: false, note: "" }}
      fields={[
        { name: "balanceCents", type: "money", label: t("fields.balance"), description: t("fields.balanceDescription"), span: "half", autoFocus: true },
        { name: "date", type: "date", label: t("fields.date"), span: "half", max: today },
        { name: "negative", type: "switch", label: t("fields.negative") },
        { name: "note", type: "text", label: t("fields.note"), maxLength: 300 },
      ]}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={t("form.balanceSet")}
    />
  );
}
