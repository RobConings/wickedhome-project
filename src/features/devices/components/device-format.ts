import { formatDate } from "@/types/date-format";

const INTL_LOCALES = { en: "en-BE", nl: "nl-BE" } as const;

/** "now", "5 minutes ago", "yesterday", or a date (dd/mm/yyyy) for anything older than a month. */
export function formatRelative(iso: string, now: number, locale: "en" | "nl"): string {
  const date = new Date(iso);
  const seconds = (date.getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(INTL_LOCALES[locale], { numeric: "auto" });
  if (abs < 45) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return format.format(Math.round(seconds / 86_400), "day");
  return formatDate(date, locale);
}
