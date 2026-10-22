import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ScrollRow } from "./scroll-row";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SummaryView } from "../types/energy";
import { ENERGY_PERIODS, periodRange, periodStart, shiftPeriod, type EnergyPeriod } from "../types/energy-period";
import { formatPeriod } from "./energy-format";

type EnergyPeriodNavProps = {
  period: EnergyPeriod;
  /** First day of the shown period, `YYYY-MM-DD`. */
  date: string;
  /** Today in the household time zone; there is nothing to show after the period containing it. */
  today: string;
  /** Kept when switching period. */
  carrier?: SummaryView;
  /** Another period is loading: a spinner next to the label (after a short delay). */
  pending?: boolean;
  className?: string;
};

/** Day / week / month / year switch with ‹ › to step through periods. State lives in the URL. */
export function EnergyPeriodNav({ period, date, today, carrier = "electricity", pending = false, className }: EnergyPeriodNavProps) {
  const { t } = useTranslation("energy");
  const href = (value: EnergyPeriod, day: string) => `/energy?carrier=${carrier}&period=${value}&date=${day}`;
  const { from, to } = periodRange(period, date);
  const isCurrent = today >= from && today < to;
  const isFuture = from > today;

  return (
    <div aria-busy={pending || undefined} className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      {/* Scrolls inside itself if the periods don't fit (narrow phones, long labels). */}
      <ScrollRow label={t("period.label")} gap="xs" focusable={false} className="inline-flex h-9 w-fit gap-0 rounded-lg bg-muted p-[3px]">
        {ENERGY_PERIODS.map((value) => (
          <Link
            key={value}
            to={href(value, periodStart(value, isCurrent ? today : date))}
            aria-current={value === period ? "true" : undefined}
            className={cn(
              "inline-flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              value === period ? "bg-background text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground",
            )}
          >
            {t(`period.${value}`)}
          </Link>
        ))}
      </ScrollRow>

      <div className="flex min-w-0 items-center gap-1">
        <Button asChild variant="ghost" size="icon" aria-label={t("period.previous")}>
          <Link to={href(period, shiftPeriod(period, date, -1))}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <p className="relative min-w-40 text-center font-medium tabular-nums first-letter:uppercase" aria-live="polite">
          {formatPeriod(period, from, to, currentLocale())}
          {pending && (
            <span className="absolute top-1/2 -right-5 flex -translate-y-1/2 animate-appear text-muted-foreground">
              <Spinner />
            </span>
          )}
        </p>
        {isCurrent || isFuture ? (
          <Button variant="ghost" size="icon" aria-label={t("period.next")} disabled>
            <ChevronRightIcon />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" aria-label={t("period.next")}>
            <Link to={href(period, shiftPeriod(period, date, 1))}>
              <ChevronRightIcon />
            </Link>
          </Button>
        )}
        {!isCurrent && (
          <Button asChild variant="outline" size="sm" className="ml-1">
            <Link to={href(period, periodStart(period, today))}>{t("period.today")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
