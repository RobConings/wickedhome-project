import * as React from "react";
import { ChartColumnIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { StackedBarChart, type StackedBarDatum } from "@/components/shared/stacked-bar-chart";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatMonthName } from "@/types/date-format";
import type { MoneyTimeline, TimelineMonth } from "../types/money";
import { money, monthLabel } from "@/lib/locale-text";
import { DeferredContent } from "@/components/shared/deferred-content";

type MoneyTimelineCardProps = {
  /** Data, or a deferred promise from the route's loader (resolving to `null` when it failed). */
  data: MoneyTimeline | Promise<MoneyTimeline | null> | null;
  className?: string;
};

const AHEAD_OPTIONS = ["6", "12", "24"] as const;
type Ahead = (typeof AHEAD_OPTIONS)[number];

/** Income and expenses per month, past and future: the expenses step down as loans end. */
export function MoneyTimelineCard({ data, className }: MoneyTimelineCardProps) {
  const { t } = useTranslation("money");
  const failed = <p className="text-sm text-muted-foreground">{t("timeline.error")}</p>;
  return (
    <Card className={cn("gap-3", className)}>
      <div className="flex items-center gap-2">
        <ChartColumnIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>{t("timeline.title")}</CardTitle>
      </div>
      <CardDescription>{t("timeline.description")}</CardDescription>
      <DeferredContent
        data={data}
        failed={failed}
        fallback={
          <div className="flex flex-col gap-3" role="status" aria-label={t("timeline.loading")}>
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-60 rounded-lg" />
          </div>
        }
      >
        {(value) => <MoneyTimelineChart data={value} />}
      </DeferredContent>
    </Card>
  );
}

/** Chart axis tick: "okt" (compact on purpose). */
const shortMonth = (month: string) => formatMonthName(Number(month.slice(5, 7)), currentLocale(), "short").replace(".", "");

/** The chart with its range switch and a one-line summary (also for screen readers). */
export function MoneyTimelineChart({ data }: { data: MoneyTimeline }) {
  const { t } = useTranslation("money");
  const [ahead, setAhead] = React.useState<Ahead>("12");
  const currentIndex = data.months.findIndex((month) => month.period === "current");
  const months = data.months.filter((_, index) => currentIndex < 0 || index <= currentIndex + Number(ahead));
  const empty = months.every((month) => month.incomeCents === 0 && month.expenseCents === 0);
  const current = months[currentIndex];
  const nextKey = months[currentIndex + 1]?.month;

  const chartData: StackedBarDatum[] = months.map((month) => ({
    key: month.month,
    // The year on January and on the first column, so a long range stays readable.
    label: month.month.endsWith("-01") || month === months[0] ? `${shortMonth(month.month)} ’${month.month.slice(2, 4)}` : shortMonth(month.month),
    title: monthLabel(month.month),
    values: {
      income: month.incomeCents - month.incomeEstimateCents,
      estimate: month.incomeEstimateCents,
      loans: month.loansCents,
      recurring: month.recurringCents,
      oneOff: month.oneOffCents,
      net: month.netCents,
    },
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label={t("timeline.ahead")}
          size="sm"
          value={ahead}
          onChange={setAhead}
          options={AHEAD_OPTIONS.map((value) => ({ value, label: t("timeline.months", { count: Number(value) }) }))}
        />
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">{t("timeline.empty")}</p>
      ) : (
        <>
          <TimelineSummary months={months} current={current} />
          <StackedBarChart
            title={t("timeline.title")}
            height={240}
            minColumnWidth={30}
            legendTotals={false}
            series={[
              // Money in is green, money out the warm family (coral, amber, pink): readable at a glance.
              { key: "income", label: t("timeline.income"), color: "var(--chart-income)" },
              { key: "estimate", label: t("timeline.estimate"), color: "color-mix(in oklab, var(--chart-income) 45%, transparent)" },
              { key: "loans", label: t("timeline.loans"), color: "var(--chart-5)", direction: "down" },
              { key: "recurring", label: t("timeline.recurring"), color: "var(--chart-expense)", direction: "down" },
              { key: "oneOff", label: t("timeline.oneOff"), color: "var(--chart-4)", direction: "down" },
            ]}
            line={{ key: "net", label: t("timeline.net"), color: "var(--foreground)" }}
            data={chartData}
            projectedFrom={nextKey}
            nowKey={current?.month}
            formatValue={money}
            formatTick={(cents) => Math.round(cents / 100).toLocaleString(currentLocale() === "nl" ? "nl-BE" : "en-BE")}
            axisLabel="€"
            labels={{
              showTable: t("timeline.showTable"),
              hideTable: t("timeline.hideTable"),
              category: t("timeline.month"),
              projected: t("timeline.projected"),
              now: t("timeline.now"),
            }}
            renderTooltip={(datum) => {
              const month = months.find((item) => item.month === datum.key);
              if (!month) return null;
              return (
                <p className="mt-1.5 border-t pt-1 text-xs text-muted-foreground">
                  {month.period === "past" ? t("timeline.actual") : month.period === "current" ? t("timeline.currentHint") : t("timeline.projectedHint")}
                  {month.incomeEstimateCents > 0 ? ` ${t("timeline.estimateHint")}` : ""}
                </p>
              );
            }}
          />
        </>
      )}
    </div>
  );
}

/**
 * "This month: € 4.200 in, € 3.420 out. Projected expenses drop from € 3.420 to € 2.567 a month in March
 * 2027." The first later month with clearly lower projected expenses (a loan ending) is named.
 */
function TimelineSummary({ months, current }: { months: TimelineMonth[]; current: TimelineMonth | undefined }) {
  const { t } = useTranslation("money");
  if (!current) return null;
  const future = months.filter((month) => month.period === "future");
  const reference = future[0] ?? current;
  // A step down of more than 2 % against the first projected month.
  const lower = future.find((month) => month.expenseCents < reference.expenseCents * 0.98);
  return (
    <p className="text-sm" aria-live="polite">
      {t("timeline.summaryNow", { income: money(current.incomeCents), expenses: money(current.expenseCents) })}
      {lower && (
        <>
          {" "}
          {t("timeline.summaryLower", { from: money(reference.expenseCents), to: money(lower.expenseCents), month: monthLabel(lower.month) })}
        </>
      )}
    </p>
  );
}
