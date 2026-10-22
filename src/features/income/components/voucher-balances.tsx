import { TicketIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import type { VoucherBalance } from "../types/income";
import { dateText, money } from "./use-income-text";

type VoucherBalancesProps = {
  balances: VoucherBalance[];
  habitants: Habitant[];
  className?: string;
};

/**
 * Meal vouchers per person (income page and money flow): what is available and when the next part expires,
 * what expired unused, and a warning on top when vouchers expire within 30 days. The oldest vouchers are used
 * first; each lot expires 12 months after it arrived (`voucherBalances`).
 */
export function VoucherBalances({ balances, habitants, className }: VoucherBalancesProps) {
  const { t } = useTranslation("income");
  const rows = balances
    .map((balance) => ({ balance, habitant: habitants.find((habitant) => habitant.id === balance.habitantId) }))
    .filter((row): row is { balance: VoucherBalance; habitant: Habitant } => Boolean(row.habitant));
  const soon = rows.filter(({ balance }) => balance.expiringSoon);

  return (
    <Card className={className}>
      <div className="flex items-center gap-2">
        <TicketIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>{t("vouchers.title")}</CardTitle>
      </div>
      <CardDescription>{t("vouchers.description")}</CardDescription>
      {soon.length > 0 && (
        <InlineAlert>
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{t("vouchers.soonTitle")}</span>
            {soon.map(({ balance, habitant }) =>
              balance.expiringSoon ? (
                <span key={habitant.id}>
                  {t("vouchers.soon", { name: habitant.name, amount: money(balance.expiringSoon.amountCents), date: dateText(balance.expiringSoon.date) })}
                </span>
              ) : null,
            )}
          </span>
        </InlineAlert>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("vouchers.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map(({ balance, habitant }) => {
            const details = [
              t("vouchers.available", { amount: money(balance.availableCents) }),
              balance.nextExpiry && t("vouchers.expiresOn", { amount: money(balance.nextExpiry.amountCents), date: dateText(balance.nextExpiry.date) }),
            ].filter(Boolean);
            const problems = [
              balance.expiredCents > 0 && t("vouchers.expired", { amount: money(balance.expiredCents) }),
              balance.uncoveredCents > 0 && t("vouchers.uncovered", { amount: money(balance.uncoveredCents) }),
            ].filter(Boolean);
            return (
              <li key={habitant.id} className="flex min-h-12 items-center gap-3 py-2">
                <HabitantAvatar habitant={habitant} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{habitant.name}</span>
                  <span className={cn("text-xs text-muted-foreground", balance.expiringSoon && "font-medium text-foreground")}>{details.join(" · ")}</span>
                  {problems.length > 0 && <span className="text-xs text-muted-foreground">{problems.join(" · ")}</span>}
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", balance.balanceCents < 0 && "text-destructive")}>{money(balance.balanceCents)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
