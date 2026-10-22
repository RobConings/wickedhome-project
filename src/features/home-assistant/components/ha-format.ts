import { intlLocale } from "../lib/format";
import type { Locale } from "@/types/common";
import { formatDateTime as formatDateTimeIn } from "@/types/date-format";

const asLocale = (language: string): Locale => (language.startsWith("nl") ? "nl" : "en");

/** "03/10/2026 14:05" (household time zone). */
export function formatDateTime(iso: string, language: string): string {
  return formatDateTimeIn(iso, asLocale(language));
}

/** "2 minutes ago", "in 30 seconds". */
export function formatRelative(iso: string, language: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(intlLocale(asLocale(language)), { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86_400), "day");
}
