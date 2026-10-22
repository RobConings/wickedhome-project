import { BanknoteIcon, UserIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageGrid } from "@/components/layout/page-grid";
import { StatTile } from "@/components/shared/stat-tile";
import type { Habitant } from "@/features/household";
import { JOINT, type IncomeMonthTotals } from "../types/income";
import { money, useWhoName } from "./use-income-text";

type IncomeMonthTotalsProps = {
  totals: IncomeMonthTotals;
  habitants: Habitant[];
};

/**
 * The month's income for the household and per person (or joint): received plus what is still expected.
 * Meal vouchers are shown apart: they are not money in the bank.
 */
export function IncomeMonthTotalsTiles({ totals, habitants }: IncomeMonthTotalsProps) {
  const { t } = useTranslation("income");
  const whoName = useWhoName(habitants);
  const order = (key: string) => (key === JOINT ? habitants.length : habitants.findIndex((habitant) => habitant.id === key));
  const people = [...totals.people].sort((a, b) => order(a.key) - order(b.key));

  const hint = (received: number, expected: number, vouchers?: number) =>
    [
      t("month.received", { amount: money(received) }),
      expected > 0 ? t("month.expected", { amount: money(expected) }) : null,
      vouchers ? t("month.vouchers", { amount: money(vouchers) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <PageGrid columns="stats">
      <StatTile
        tone="featured"
        icon={BanknoteIcon}
        label={t("month.household")}
        value={money(totals.household.totalCents)}
        hint={hint(totals.household.receivedCents, totals.household.expectedCents)}
      />
      {people.map((total) => (
        <StatTile
          key={total.key}
          icon={total.key === JOINT ? UsersIcon : UserIcon}
          label={whoName(total.key)}
          value={money(total.totalCents)}
          hint={hint(total.receivedCents, total.expectedCents, totals.vouchersCents[total.key])}
        />
      ))}
    </PageGrid>
  );
}
