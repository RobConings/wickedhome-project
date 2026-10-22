import type * as React from "react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { contributionPlanSchema, type ContributionPlan, type JointAccount } from "../types/money";
import { people } from "./use-money-text";

type ContributionPlanDialogProps = {
  trigger?: React.ReactElement;
  accounts: JointAccount[];
  habitants: Habitant[];
  /** First day of the month shown: the default start of a new plan or a new amount. */
  monthStart: string;
  plan?: ContributionPlan;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** A person's fixed monthly contribution to a joint account. */
export function ContributionPlanDialog({ trigger, accounts, habitants, monthStart, plan, open, onOpenChange }: ContributionPlanDialogProps) {
  const { t } = useTranslation("money");
  const active = accounts.filter((account) => !account.archived || account.id === plan?.accountId);
  const contributors = people(habitants);
  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? t("form.editPlanTitle") : t("form.createPlanTitle")}
      schema={contributionPlanSchema}
      intent={plan ? "update-plan" : "create-plan"}
      hiddenFields={{ id: plan?.id }}
      defaultValues={{
        habitantId: plan?.habitantId ?? contributors[0]?.id ?? "",
        accountId: plan?.accountId ?? active.find((account) => account.kind === "joint")?.id ?? active[0]?.id ?? "",
        amountCents: plan?.amountCents ?? null,
        dayOfMonth: String(plan?.dayOfMonth ?? 1),
        activeFrom: plan ? (plan.activeFrom > monthStart ? plan.activeFrom : monthStart) : monthStart,
        activeTo: plan?.activeTo ?? "",
        note: plan?.note ?? "",
      }}
      fields={[
        {
          name: "habitantId",
          type: "select",
          label: t("fields.who"),
          span: "half",
          options: contributors.map((habitant) => ({
            value: habitant.id,
            label: habitant.name,
            icon: <HabitantAvatar habitant={habitant} size="sm" className="size-5" />,
          })),
        },
        { name: "accountId", type: "select", label: t("fields.account"), span: "half", options: active.map((account) => ({ value: account.id, label: account.name })) },
        { name: "amountCents", type: "money", label: t("fields.amount"), span: "half" },
        { name: "dayOfMonth", type: "number", label: t("fields.dayOfMonth"), span: "half", min: 1, max: 31, step: 1, inputMode: "numeric" },
        { name: "activeFrom", type: "date", label: t("fields.activeFrom"), span: "half", description: plan ? t("fields.activeFromDescription") : undefined },
        { name: "activeTo", type: "date", label: t("fields.activeTo"), span: "half" },
        { name: "note", type: "text", label: t("fields.note"), maxLength: 300 },
      ]}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={t("form.planSaved")}
    />
  );
}
