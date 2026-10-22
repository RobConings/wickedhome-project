import { ArrowRightIcon, LandmarkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { MoneySummary } from "@/features/money";
import { cn } from "@/lib/utils";
import { money } from "@/lib/locale-text";
import { IconCardHeader } from "@/components/shared/icon-card-header";

type MoneyCardProps = {
  /** This month's money figures; `null` when they failed to load (only this card shows an error). */
  summary: MoneySummary | null;
};

/** This month in (income) and out (expenses due), and the joint account balances. */
export function MoneyCard({ summary }: MoneyCardProps) {
  const { t } = useTranslation("dashboard");

  return (
    <Card>
      <IconCardHeader icon={LandmarkIcon} tone="success" title={t("money.title")} />

      {!summary ? (
        <InlineAlert tone="error">{t("loadError")}</InlineAlert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("money.in")}</span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">{money(summary.incomeCents)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{t("money.received", { amount: money(summary.incomeReceivedCents) })}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("money.out")}</span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">{money(summary.outCents)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{t("money.paid", { amount: money(summary.outPaidCents) })}</span>
            </div>
          </div>
          {summary.jointBalanceCents === null && summary.savingsBalanceCents === null ? (
            <p className="text-sm text-muted-foreground">{t("money.noAccounts")}</p>
          ) : (
            <dl className="flex flex-col divide-y border-t text-sm">
              {[
                { term: t("money.joint"), value: summary.jointBalanceCents },
                { term: t("money.savings"), value: summary.savingsBalanceCents },
              ]
                .filter((row): row is { term: string; value: number } => row.value !== null)
                .map((row) => (
                  <div key={row.term} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">{row.term}</dt>
                    <dd className={cn("font-medium tabular-nums", row.value < 0 && "text-destructive")}>{money(row.value)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </>
      )}

      <CardFooter>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to="/money">
            {t("money.view")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
