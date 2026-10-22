import type * as React from "react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { otherEntrySchema, type JointAccount } from "../types/money";

type OtherEntryDialogProps = {
  trigger?: React.ReactElement;
  account: JointAccount;
  today: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Other money in (interest…) or out (a withdrawal…) of a joint account. */
export function OtherEntryDialog({ trigger, account, today, open, onOpenChange }: OtherEntryDialogProps) {
  const { t } = useTranslation("money");
  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.otherTitle", { name: account.name })}
      schema={otherEntrySchema}
      intent="other-entry"
      hiddenFields={{ id: account.id }}
      defaultValues={{ direction: "out", amountCents: null, date: today, note: "" }}
      fields={[
        {
          name: "direction",
          type: "select",
          label: t("fields.direction"),
          options: [
            { value: "in", label: t("fields.in") },
            { value: "out", label: t("fields.out") },
          ],
        },
        { name: "amountCents", type: "money", label: t("fields.amount"), span: "half" },
        { name: "date", type: "date", label: t("fields.date"), span: "half" },
        { name: "note", type: "text", label: t("fields.note"), maxLength: 300 },
      ]}
      successMessage={t("form.otherSaved")}
    />
  );
}
