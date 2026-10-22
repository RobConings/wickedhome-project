import type * as React from "react";
import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GeneralFormDialog } from "./general-form-dialog";
import type { GeneralFormField } from "./general-form";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_COLORS,
  ACCOUNT_KINDS,
  accountCreateSchema,
  accountUpdateSchema,
  type AccountKind,
  type JointAccount,
} from "../types/money";
import { people } from "./use-money-text";

type AccountFormDialogProps = {
  trigger?: React.ReactElement;
  habitants: Habitant[];
  today: string;
  /** Edit this account; leave out to add one. */
  account?: JointAccount;
  /** Kind of a new account. */
  defaultKind?: AccountKind;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Owners as toggle chips; posts the chosen ids comma-separated. */
function OwnersField({
  id,
  name,
  value,
  setValue,
  habitants,
  disabled,
}: {
  id: string;
  name: string;
  value: unknown;
  setValue: (value: unknown) => void;
  habitants: Habitant[];
  disabled: boolean;
}) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (habitantId: string) =>
    setValue(selected.includes(habitantId) ? selected.filter((item) => item !== habitantId) : [...selected, habitantId]);
  return (
    <div id={id} className="flex flex-wrap gap-2">
      <input type="hidden" name={name} value={selected.join(",")} />
      {habitants.map((habitant) => {
        const active = selected.includes(habitant.id);
        return (
          <button
            key={habitant.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => toggle(habitant.id)}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
              active ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
            )}
          >
            <HabitantAvatar habitant={habitant} size="sm" className="size-6" />
            {habitant.name}
            {active && <CheckIcon className="size-4 text-primary" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Add a joint (current or savings) account with its opening balance, or edit one. */
export function AccountFormDialog({ trigger, habitants, today, account, defaultKind = "joint", open, onOpenChange }: AccountFormDialogProps) {
  const { t } = useTranslation("money");
  const isEdit = Boolean(account);
  const owners = people(habitants);

  const fields: GeneralFormField[] = [
    { name: "name", type: "text", label: t("fields.name"), placeholder: t("fields.namePlaceholder"), maxLength: 60 },
    ...(isEdit
      ? []
      : ([
          {
            name: "kind",
            type: "select",
            label: t("fields.kind"),
            options: ACCOUNT_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) })),
          },
        ] satisfies GeneralFormField[])),
    { name: "iban", type: "text", label: t("fields.iban"), placeholder: "BE00 0000 0000 0000", autoComplete: "off", maxLength: 42 },
    {
      name: "ownerIds",
      type: "custom",
      label: t("fields.owners"),
      render: ({ id, name, value, setValue, disabled }) => (
        <OwnersField id={id} name={name} value={value} setValue={setValue} habitants={owners} disabled={disabled} />
      ),
    },
    ...(isEdit
      ? ([
          {
            name: "isDefault",
            type: "switch",
            label: t("fields.isDefault"),
            description: t("fields.isDefaultDescription"),
            hidden: account?.kind !== "joint",
          },
          { name: "archived", type: "switch", label: t("fields.archived") },
        ] satisfies GeneralFormField[])
      : ([
          { name: "openingBalanceCents", type: "money", label: t("fields.openingBalance"), span: "half" },
          { name: "openingDate", type: "date", label: t("fields.openingDate"), span: "half", description: t("fields.openingDescription") },
          { name: "negative", type: "switch", label: t("fields.negative") },
        ] satisfies GeneralFormField[])),
    { name: "color", type: "color", label: t("fields.color"), colors: ACCOUNT_COLORS },
  ];

  return (
    <GeneralFormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("form.editAccountTitle") : t("form.createAccountTitle")}
      schema={isEdit ? accountUpdateSchema : accountCreateSchema}
      intent={isEdit ? "update-account" : "create-account"}
      hiddenFields={{ id: account?.id }}
      defaultValues={{
        name: account?.name ?? "",
        kind: account?.kind ?? defaultKind,
        iban: account?.iban ?? "",
        ownerIds: account?.ownerIds ?? owners.filter((habitant) => habitant.type === "adult").map((habitant) => habitant.id),
        isDefault: account?.isDefault ?? false,
        archived: account?.archived ?? false,
        openingBalanceCents: null,
        openingDate: today,
        negative: false,
        color: account?.color ?? (defaultKind === "savings" ? ACCOUNT_COLORS[5] : ACCOUNT_COLORS[0]),
      }}
      fields={fields}
      translateError={(message) => t(`errors.${message}`, { defaultValue: message })}
      successMessage={isEdit ? t("form.accountSaved") : t("form.accountCreated")}
    />
  );
}
