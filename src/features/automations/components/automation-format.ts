import type { TFunction } from "i18next";
import { intlLocale } from "@/lib/format";
import type { Locale } from "@/types/common";
import { formatDate, formatDateTime } from "@/types/date-format";
import { describeSchedule } from "../types/schedule-description";

/** Formatting for the automations UI: schedules in words, relative times, durations. */

const listFormat = (locale: Locale, items: string[]) =>
  new Intl.ListFormat(intlLocale(locale), { style: "long", type: "conjunction" }).format(items);

/** 1 = Monday … 0 = Sunday → "maandag". 2026-10-04 is a Sunday. */
const weekdayName = (locale: Locale, day: number) =>
  new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 4 + day)));

/** "Every day at 05:15", "Elke maandag en donderdag om 07:00", or the raw expression. */
export function scheduleText(t: TFunction, locale: Locale, expression: string): string {
  const schedule = describeSchedule(expression);
  const minute = (value: number) => String(value).padStart(2, "0");
  switch (schedule.kind) {
    case "everyMinutes":
      return schedule.interval === 1 ? t("automations:schedule.everyMinute") : t("automations:schedule.everyMinutes", { count: schedule.interval });
    case "hourly":
      return t("automations:schedule.hourly", { minute: minute(schedule.minute) });
    case "everyHours":
      return t("automations:schedule.everyHours", { count: schedule.interval, minute: minute(schedule.minute) });
    case "daily":
      return t("automations:schedule.daily", { times: listFormat(locale, schedule.times) });
    case "weekdays":
      return t("automations:schedule.weekdays", { times: listFormat(locale, schedule.times) });
    case "weekly":
      return t("automations:schedule.weekly", {
        days: listFormat(locale, schedule.days.map((day) => weekdayName(locale, day))),
        times: listFormat(locale, schedule.times),
      });
    case "monthly":
      return t("automations:schedule.monthly", { day: schedule.day, times: listFormat(locale, schedule.times) });
    case "custom":
      return t("automations:schedule.custom", { expression: schedule.expression });
  }
}

/** "in 3 hours", "5 minutes ago", "yesterday"; a date (dd/mm/yyyy) after a month. */
export function relativeTime(iso: string, locale: Locale, now: number): string {
  const date = new Date(iso);
  const seconds = (date.getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (abs < 45) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return format.format(Math.round(seconds / 86_400), "day");
  return formatDate(date, locale);
}

/** "di 06/10/2026 05:15", for the exact time next to a relative one. */
export const dateTimeText = (iso: string, locale: Locale) => formatDateTime(iso, locale, { weekday: "short" });

export function durationText(t: TFunction, ms: number): string {
  if (ms < 1000) return t("automations:duration.ms", { count: ms });
  if (ms < 60_000) return t("automations:duration.s", { count: Math.round(ms / 100) / 10 });
  return t("automations:duration.min", { count: Math.round(ms / 6000) / 10 });
}
