import { useTranslation } from "react-i18next";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate, formatWeekday } from "@/types/date-format";

type DateBlockProps = {
  /** `YYYY-MM-DD` */
  date: string;
  className?: string;
};

/**
 * A small calendar-sheet date: short weekday over the day number ("MON 12"), for lists of upcoming things. The
 * compact sheet is decoration; the title and screen readers get the full date ("zaterdag 03/10/2026").
 */
export function DateBlock({ date, className }: DateBlockProps) {
  useTranslation(); // re-render when the language changes
  const locale = currentLocale();
  const weekday = formatWeekday(date, locale, "short");
  const day = String(Number(date.slice(8, 10)));
  const full = formatDate(date, locale, { weekday: "long" });

  return (
    <time
      dateTime={date}
      title={full}
      className={cn("flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-lg border bg-background py-1.5 leading-none", className)}
    >
      <span aria-hidden="true" className="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
        {weekday}
      </span>
      <span aria-hidden="true" className="text-lg font-semibold tabular-nums">
        {day}
      </span>
      <span className="sr-only">{full}</span>
    </time>
  );
}
