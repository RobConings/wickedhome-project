import type { Locale } from "@/types/common";
import { intlLocale } from "./format";

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** `1,2 MB`, `850 kB`, `3 bytes` in the user's language (decimal units, like file managers on the web). */
export function formatBytes(bytes: number, locale: Locale): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: unit === 0 ? "long" : "short",
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
  }).format(value);
}
