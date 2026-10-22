import type { TFunction } from "i18next";
import type { Locale } from "@/types/common";
import { formatDate, formatMonthName, formatWeekday } from "@/types/date-format";
import { addDays } from "@/types/dates";
import { WEEKDAY_CODES, monthWindow, parseRRule, seasonOf } from "@/types/recurrence";
import { intlLocale } from "./format";

/**
 * Human text for RRULEs (`@/types/recurrence`), in the `common` namespace (`recurrence.summary.*`).
 * Dates go through `@/types/date-format` (calendar dates, never shifted a day): "until 30/06/2027".
 */

/** Weekday names, Monday first. */
export function weekdayNames(locale: Locale, width: "narrow" | "short" | "long" = "long"): string[] {
  // 2026-09-28 is a Monday.
  return Array.from({ length: 7 }, (_, index) => formatWeekday(addDays("2026-09-28", index), locale, width));
}

/** Month name (1–12), e.g. "March" / "maart". */
export const monthName = (month: number, locale: Locale, width: "long" | "short" = "long") => formatMonthName(month, locale, width);

/**
 * "Every week on Monday and Wednesday, until 30/06/2027", "Every spring (March–May)". `null` without
 * a rule; a generic "Custom repeat" for rules outside the supported subset.
 */
export function describeRecurrence(rrule: string | null | undefined, locale: Locale, t: TFunction): string | null {
  if (!rrule) return null;
  const rule = parseRRule(rrule);
  if (!rule) return t("common:recurrence.summary.custom");

  let text: string;
  const window = monthWindow(rule);
  if (window) {
    const season = seasonOf(rule);
    const months =
      window.start === window.end
        ? monthName(window.start, locale)
        : `${monthName(window.start, locale)}–${monthName(window.end, locale)}`;
    text = season
      ? t("common:recurrence.summary.season", { count: rule.interval, season: t(`common:recurrence.seasonsInline.${season}`), months })
      : t("common:recurrence.summary.window", { count: rule.interval, months });
  } else {
    text = t(`common:recurrence.summary.every.${rule.freq}`, { count: rule.interval });
  }

  if (rule.freq === "WEEKLY" && rule.byDay?.length) {
    const names = weekdayNames(locale, "long");
    const days = rule.byDay.map((code) => names[WEEKDAY_CODES.indexOf(code)] ?? code);
    const list = new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(days);
    text = t("common:recurrence.summary.onDays", { rule: text, days: list });
  }
  if (rule.until) {
    text = t("common:recurrence.summary.until", { rule: text, date: formatDate(rule.until, locale) });
  }
  if (rule.count) text = t("common:recurrence.summary.times", { rule: text, count: rule.count });
  return text;
}
