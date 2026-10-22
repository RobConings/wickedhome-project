import type { Locale } from "@/types/common";

/**
 * Both languages use Belgian conventions: comma decimals, € 1.234,56. Dates are not formatted here: always
 * use `@/types/date-format` (dd/mm/yyyy, 24-hour times), shared with the API.
 */
const INTL_LOCALE: Record<Locale, string> = { en: "en-BE", nl: "nl-BE" };

export const intlLocale = (locale: Locale) => INTL_LOCALE[locale];

export function formatCurrency(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
}
