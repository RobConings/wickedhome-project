import { intlLocale } from "../lib/format";
import type { Locale } from "@/types/common";

/** `12,5 m²` (or `12,65 m²` with two digits, to compare with the architect's areas) */
export function formatArea(areaM2: number, locale: Locale, digits = 1): string {
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(areaM2);
  return `${number} m²`;
}

/** A plan length in cm as metres: `3,45 m` */
export function formatLength(cm: number, locale: Locale): string {
  const number = new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    cm / 100,
  );
  return `${number} m`;
}
