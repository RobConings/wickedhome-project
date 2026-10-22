import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { takeBackSchema } from "../types/money";

type TakeBackDialogProps = {
  habitantId: string;
  personName: string;
  accountId: string;
  accountName: string;
  /** Prefill: the over-contribution. */
  amountCents: number;
  today: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * "Take back": a person takes an over-contribution back out of the joint account. Saved as a negative
 * contribution of that person: it lowers the balance and their net transferred amount for the month.
 */
export function TakeBackDialog({ habitantId, personName, accountId, accountName, amountCents, today, open, onOpenChange }: TakeBackDialogProps) {
  const { t } = useTranslation("money");
  return (
    <GeneralFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.takeBackTitle", { account: accountName })}
      description={t("form.takeBackDescription", { name: personName })}
      schema={takeBackSchema}
      intent="take-back"
      hiddenFields={{ habitantId, accountId }}
      defaultValues={{ amountCents, date: today, note: "" }}
      fields={[
        { name: "amountCents", type: "money", label: t("fields.amount"), span: "half", autoFocus: true },
        { name: "date", type: "date", label: t("fields.date"), span: "half" },
        { name: "note", type: "text", label: t("fields.note"), maxLength: 300 },
      ]}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={t("form.takeBackSaved")}
    />
  );
}
