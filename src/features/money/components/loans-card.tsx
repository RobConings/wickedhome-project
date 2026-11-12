import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { RecordLink as Link } from "@/components/shared/record-link";
import * as React from "react";
import { HandCoinsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Await } from "react-router";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardTitle } from "@/components/shared/card";
import { TotalOpenProgressBar, totalOpenPaidPercent } from "@/features/expenses";
import { cn } from "@/lib/utils";
import type { MoneyLoans } from "../types/money";
import { money } from "./use-money-text";

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
  const failed = <Text size="sm" tone="muted">{t("loans.error")}</Text>;
  const content =
    data instanceof Promise ? (
      <React.Suspense fallback={<LoansSkeleton label={t("loans.loading")} />}>
        <Await resolve={data} errorElement={failed}>
          {(resolved: MoneyLoans | null) => (resolved ? <LoansSummary data={resolved} /> : failed)}
        </Await>
      </React.Suspense>
    ) : data === null ? (
      failed
    ) : (
      <LoansSummary data={data} />
    );

  return (
    <Card className={cn("gap-3", className)}>
      <Inline gap="sm" align="center">
        <HandCoinsIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>
          <Link to="/expenses?view=recurring&kind=loan" className="hover:underline">
            {t("loans.title")}
          </Link>
        </CardTitle>
      </Inline>
      {content}
    </Card>
  );
}

function LoansSkeleton({ label }: { label: string }) {
  return (
    <Stack gap="3"  role="status" aria-label={label}>
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-10 rounded-lg" />
      <Skeleton className="h-10 rounded-lg" />
    </Stack>
  );
}

/** The figures and the rows (also used on its own in stories). */
export function LoansSummary({ data }: { data: MoneyLoans }) {
  const { t } = useTranslation("money");
  const { loans, totals } = data;
  if (loans.length === 0) return <Text size="sm" tone="muted">{t("loans.empty")}</Text>;
  const percent = totalOpenPaidPercent({ totalCents: totals.totalCents, remainingCents: totals.remainingCents });

  return (
    <Stack gap="md">
      {totals.trackedCount > 0 && (
        <Stack gap="sm">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <Stack gap="none" className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("loans.open")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.remainingCents)}</dd>
            </Stack>
            <Stack gap="none" className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("loans.repaid")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.repaidCents)}</dd>
            </Stack>
            <Stack gap="none" className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("loans.perMonth")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.monthlyCents)}</dd>
            </Stack>
          </dl>
          <Progress value={percent} label={t("loans.progress", { percent })} />
          <Text size="xs" tone="muted">{t("loans.ofTotal", { total: money(totals.totalCents), percent })}</Text>
        </Stack>
      )}
      {totals.trackedCount === 0 && (
        <Text size="sm">
          <span className="text-muted-foreground">{t("loans.perMonth")}: </span>
          <span className="font-semibold tabular-nums">{money(totals.monthlyCents)}</span>
        </Text>
      )}

      <ul className="flex flex-col divide-y">
        {loans.map((loan) => (
          <li key={loan.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
            <Inline gap="md" align="baseline" justify="between" className="min-w-0">
              <Link to={`/expenses/recurring/${encodeURIComponent(loan.id)}`} className="truncate text-sm font-medium hover:underline">
                {loan.payee}
              </Link>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {loan.totalOpen ? money(loan.totalOpen.remainingCents) : t("loans.monthly", { amount: money(loan.monthlyCents) })}
              </span>
            </Inline>
            {loan.totalOpen ? (
              <TotalOpenProgressBar progress={loan.totalOpen} />
            ) : (
              <Text size="xs" tone="muted">{t("loans.noTotal")}</Text>
            )}
            {loan.status === "paused" && <Text size="xs" tone="warning" weight="medium">{t("loans.paused")}</Text>}
          </li>
        ))}
      </ul>
    </Stack>
  );
}
