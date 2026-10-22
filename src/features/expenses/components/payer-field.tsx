import * as React from "react";
import { UserIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Stack } from "./stack";
import { MoneyInput } from "./money-input";
import { SegmentedControl } from "./segmented-control";
import { HabitantAvatar, HabitantPicker, type Habitant } from "@/features/household";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isEqualSplit, splitEqually } from "../types/expense-calculations";
import type { ExpenseShare, PayerType } from "../types/expenses";

type SplitMode = "equal" | "custom";

type PayerFieldProps = {
  /** The total; equal shares follow it as it changes. */
  amountCents: number | null;
  habitants: Habitant[];
  defaultPayerType?: PayerType;
  defaultHabitantId?: string | null;
  defaultShares?: ExpenseShare[];
  /** Messages shown under the field (already translated). */
  error?: string;
  /**
   * Meal vouchers belong to a person: while true, "Joint account" isn't offered and a joint payer switches to
   * one person, `meHabitantId` (the logged-in person) unless someone was already picked.
   */
  personOnly?: boolean;
  meHabitantId?: string | null;
};

/**
 * Who pays: the joint account (default), one person, or split between persons (equally, cent-exact, or
 * by amounts with what is left to divide). Posts `payerType`, `payerHabitantId` and `shares` (JSON).
 * Pets can't pay, so they aren't offered.
 */
export function PayerField({
  amountCents,
  habitants,
  defaultPayerType = "joint",
  defaultHabitantId = null,
  defaultShares = [],
  error,
  personOnly = false,
  meHabitantId = null,
}: PayerFieldProps) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const payers = habitants.filter((habitant) => habitant.type !== "pet");

  const startsAsPerson = personOnly && defaultPayerType === "joint";
  const [payerType, setPayerType] = React.useState<PayerType>(startsAsPerson ? "person" : defaultPayerType);
  const [habitantId, setHabitantId] = React.useState<string | null>(startsAsPerson ? (defaultHabitantId ?? meHabitantId) : defaultHabitantId);

  // Picking meal vouchers while the joint account pays: switch to the logged-in person (during render).
  const [wasPersonOnly, setWasPersonOnly] = React.useState(personOnly);
  if (personOnly !== wasPersonOnly) {
    setWasPersonOnly(personOnly);
    if (personOnly && payerType === "joint") {
      setPayerType("person");
      if (!habitantId) setHabitantId(meHabitantId);
    }
  }
  const [mode, setMode] = React.useState<SplitMode>(() =>
    defaultShares.length === 0 || isEqualSplit(amountCents ?? 0, defaultShares) ? "equal" : "custom",
  );
  const [selected, setSelected] = React.useState<string[]>(() =>
    defaultShares.length > 0
      ? defaultShares.map((share) => share.habitantId)
      : payers.filter((habitant) => habitant.type === "adult").map((habitant) => habitant.id),
  );
  const [custom, setCustom] = React.useState<Record<string, number | null>>(() =>
    Object.fromEntries(defaultShares.map((share) => [share.habitantId, share.amountCents])),
  );

  // Keep the payers' order stable (habitant order), whatever order they were toggled in.
  const selectedIds = payers.map((habitant) => habitant.id).filter((id) => selected.includes(id));
  const total = amountCents ?? 0;
  const shares: ExpenseShare[] =
    payerType !== "split"
      ? []
      : mode === "equal"
        ? splitEqually(total, selectedIds)
        : selectedIds.map((id) => ({ habitantId: id, amountCents: custom[id] ?? 0 }));
  const remaining = total - shares.reduce((sum, share) => sum + share.amountCents, 0);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <Stack gap="sm">
      <input type="hidden" name="shares" value={JSON.stringify(shares)} />
      <SegmentedControl
        name="payerType"
        label={t("payer.label")}
        value={payerType}
        onChange={setPayerType}
        options={[
          ...(personOnly ? [] : [{ value: "joint" as const, label: t("payer.joint"), icon: WalletIcon }]),
          { value: "person", label: t("payer.person"), icon: UserIcon },
          { value: "split", label: t("payer.split"), icon: UsersIcon },
        ]}
        size="lg"
        className="flex w-full [&>label]:flex-1 [&>label>span]:w-full"
      />

      {personOnly && <p className="text-xs text-muted-foreground">{t("payer.vouchersPersonal")}</p>}

      {payerType === "person" && (
        <HabitantPicker
          id="expense-payer-habitant"
          name="payerHabitantId"
          habitants={payers}
          value={habitantId}
          onChange={setHabitantId}
          placeholder={t("payer.choosePerson")}
        />
      )}

      {payerType === "split" && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("payer.pickHabitants")}</p>
            <SegmentedControl
              size="sm"
              label={t("payer.split")}
              value={mode}
              onChange={setMode}
              options={[
                { value: "equal", label: t("payer.equal") },
                { value: "custom", label: t("payer.custom") },
              ]}
            />
          </div>
          <ul className="flex flex-col gap-2">
            {payers.map((habitant) => {
              const isSelected = selectedIds.includes(habitant.id);
              const share = shares.find((value) => value.habitantId === habitant.id);
              return (
                <li key={habitant.id} className="flex min-h-10 items-center gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={isSelected}
                      onChange={() => toggle(habitant.id)}
                    />
                    <HabitantAvatar habitant={habitant} size="sm" />
                    <span className={cn("truncate text-sm", !isSelected && "text-muted-foreground")}>{habitant.name}</span>
                  </label>
                  {isSelected && mode === "equal" && share && (
                    <span className="text-sm tabular-nums">{formatCurrency(share.amountCents, locale)}</span>
                  )}
                  {isSelected && mode === "custom" && (
                    <MoneyInput
                      aria-label={t("payer.shareOf", { name: habitant.name })}
                      className="w-32"
                      defaultValueCents={custom[habitant.id] ?? null}
                      onValueChange={(cents) => setCustom((current) => ({ ...current, [habitant.id]: cents }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {mode === "custom" && selectedIds.length > 0 && (
            <p className={cn("text-xs", remaining === 0 ? "text-success" : "text-warning")} aria-live="polite">
              {remaining === 0
                ? t("payer.balanced")
                : remaining > 0
                  ? t("payer.remaining", { amount: formatCurrency(remaining, locale) })
                  : t("payer.over", { amount: formatCurrency(-remaining, locale) })}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </Stack>
  );
}
