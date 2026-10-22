import { WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card, CardTitle } from "./card";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { amountFor, nextPerPayer } from "../types/expense-calculations";
import type { Expense } from "../types/expenses";
import { shortDate } from "./use-expense-text";

type NextToPayProps = {
  /** Unpaid expenses, soonest first. */
  unpaid: Expense[];
  habitants: Habitant[];
  today: string;
};

/**
 * "Next for the joint account" and "next for <person>" at a glance: one line each with payee, date and
 * the amount that person (or the joint account) pays. People without anything to pay are left out.
 */
export function NextToPay({ unpaid, habitants, today }: NextToPayProps) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const payers = habitants.filter((habitant) => habitant.type !== "pet");
  const { joint, byHabitant } = nextPerPayer(unpaid, payers.map((habitant) => habitant.id));

  const rows = [
    { key: "joint", label: t("next.joint"), leading: <WalletIcon className="size-4 text-muted-foreground" aria-hidden="true" />, expense: joint, amount: joint?.amountCents ?? 0 },
    ...payers.flatMap((habitant) => {
      const expense = byHabitant[habitant.id];
      return expense
        ? [{ key: habitant.id, label: habitant.name, leading: <HabitantAvatar habitant={habitant} size="sm" />, expense, amount: amountFor(expense, habitant.id) }]
        : [];
    }),
  ];

  return (
    <Card>
      <CardTitle>{t("next.title")}</CardTitle>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => (
          <li key={row.key}>
            {row.expense ? (
              <Link
                to={`/expenses/${row.expense.id}`}
                className="flex min-h-11 items-center gap-3 py-2 text-sm hover:text-primary"
              >
                <span className="grid size-7 shrink-0 place-items-center">{row.leading}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{row.label}</span>
                  <span className={cn("truncate text-xs text-muted-foreground", row.expense.dueDate < today && "text-destructive")}>
                    {t("next.onDate", { payee: row.expense.payee, date: shortDate(row.expense.dueDate) })}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatCurrency(row.amount, locale)}</span>
              </Link>
            ) : (
              <div className="flex min-h-11 items-center gap-3 py-2 text-sm">
                <span className="grid size-7 shrink-0 place-items-center">{row.leading}</span>
                <span className="flex-1 font-medium">{row.label}</span>
                <span className="text-xs text-muted-foreground">{t("next.nothing")}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
