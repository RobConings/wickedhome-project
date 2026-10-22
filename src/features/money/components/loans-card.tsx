import * as React from "react";
import { HandCoinsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardTitle } from "@/components/shared/card";
import { TotalOpenProgressBar, totalOpenPaidPercent } from "@/features/expenses";
import { cn } from "@/lib/utils";
import type { MoneyLoans } from "../types/money";
import { money } from "@/lib/locale-text";
import { DeferredContent } from "@/components/shared/deferred-content";

type LoansCardProps = {
  /** Data, or a deferred promise from the route's loader (resolving to `null` when it failed). */
  data: MoneyLoans | Promise<MoneyLoans | null> | null;
  className?: string;
};

/**
 * Loans and down payments: still open over all loans with a total open amount, repaid since their as-of
 * dates, the monthly cost now, and per loan what is left with its progress and last payment.
 */
export function LoansCard({ data, className }: LoansCardProps) {
  const { t } = useTranslation("money");
  const failed = <p className="text-sm text-muted-foreground">{t("loans.error")}</p>;
  const content = (
    <DeferredContent data={data} failed={failed} fallback={<LoansSkeleton label={t("loans.loading")} />}>
      {(value) => <LoansSummary data={value} />}
    </DeferredContent>
  );

  return (
    <Card className={cn("gap-3", className)}>
      <div className="flex items-center gap-2">
        <HandCoinsIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>
          <Link to="/expenses?view=recurring&kind=loan" className="hover:underline">
            {t("loans.title")}
          </Link>
        </CardTitle>
      </div>
      {content}
    </Card>
  );
}

function LoansSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={label}>
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-10 rounded-lg" />
      <Skeleton className="h-10 rounded-lg" />
    </div>
  );
}

/** The figures and the rows (also used on its own in stories). */
export function LoansSummary({ data }: { data: MoneyLoans }) {
  const { t } = useTranslation("money");
  const { loans, totals } = data;
  if (loans.length === 0) return <p className="text-sm text-muted-foreground">{t("loans.empty")}</p>;
  const percent = totalOpenPaidPercent({ totalCents: totals.totalCents, remainingCents: totals.remainingCents });

  return (
    <div className="flex flex-col gap-4">
      {totals.trackedCount > 0 && (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{t("loans.open")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.remainingCents)}</dd>
            </div>
            <div className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{t("loans.repaid")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.repaidCents)}</dd>
            </div>
            <div className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{t("loans.perMonth")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.monthlyCents)}</dd>
            </div>
          </dl>
          <Progress value={percent} label={t("loans.progress", { percent })} />
          <p className="text-xs text-muted-foreground">{t("loans.ofTotal", { total: money(totals.totalCents), percent })}</p>
        </div>
      )}
      {totals.trackedCount === 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("loans.perMonth")}: </span>
          <span className="font-semibold tabular-nums">{money(totals.monthlyCents)}</span>
        </p>
      )}

      <ul className="flex flex-col divide-y">
        {loans.map((loan) => (
          <li key={loan.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <Link to={`/expenses/recurring/${encodeURIComponent(loan.id)}`} className="truncate text-sm font-medium hover:underline">
                {loan.payee}
              </Link>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {loan.totalOpen ? money(loan.totalOpen.remainingCents) : t("loans.monthly", { amount: money(loan.monthlyCents) })}
              </span>
            </div>
            {loan.totalOpen ? (
              <TotalOpenProgressBar progress={loan.totalOpen} />
            ) : (
              <p className="text-xs text-muted-foreground">{t("loans.noTotal")}</p>
            )}
            {loan.status === "paused" && <p className="text-xs font-medium text-warning">{t("loans.paused")}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
