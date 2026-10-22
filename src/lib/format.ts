import type { Locale } from "@/types/common";
import { formatDate } from "@/types/date-format";

/**
 * Both languages use Belgian conventions: comma decimals, € 1.234,56. Dates are not formatted here: always
 * use `@/types/date-format` (dd/mm/yyyy, 24-hour times), shared with the API.
 */
const INTL_LOCALE: Record<Locale, string> = { en: "en-BE", nl: "nl-BE" };

export const intlLocale = (locale: Locale) => INTL_LOCALE[locale];

export function formatCurrency(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "5 minutes ago", "in 6 days", "yesterday"; a date (dd/mm/yyyy) after a month. */
export function formatRelativeTime(iso: string, locale: Locale, now: number): string {
  const date = new Date(iso);
  const seconds = (date.getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (abs < 45) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86_400) return format.format(Math.round(seconds / 86_400), "day");
  return formatDate(date, locale);
}

/**
 * The first letters of the first two words: "Bouwbedrijf Peeters" → "BP". `separator` splits the words
 * (whitespace by default); `skipEmpty` ignores empty parts (leading separators).
 */
export function initials(name: string, { separator = /\s+/, skipEmpty = false }: { separator?: RegExp; skipEmpty?: boolean } = {}): string {
  const parts = name.split(separator);
  return (skipEmpty ? parts.filter(Boolean) : parts)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** A number in Belgian format ("1.234,5"); `options` as for `Intl.NumberFormat`. */
export const formatNumber = (value: number, locale: Locale, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(intlLocale(locale), options).format(value);

/** A ratio as a whole percentage: 0.42 → "42 %". */
export const formatPercent = (ratio: number, locale: Locale) => formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 0 });
