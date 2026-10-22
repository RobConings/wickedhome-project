import { intlLocale } from "../lib/format";
import type { Locale } from "@/types/common";
import {
  formatDate,
  formatDateRange,
  formatMonth as formatMonthHeader,
  formatMonthName,
  formatWeekday,
} from "@/types/date-format";
import type { EnergyPeriod } from "../types/energy-period";

/**
 * Number formatting for energy, Belgian style (comma decimals). Energy is stored in Wh and shown in kWh;
 * smaller numbers get more decimals so a quarter-hour of 0,12 kWh doesn't round to 0.
 */
export function formatKwh(wh: number, locale: Locale, { unit = true }: { unit?: boolean } = {}): string {
  const kwh = wh / 1000;
  const abs = Math.abs(kwh);
  const digits = abs === 0 ? 0 : abs < 10 ? 2 : abs < 100 ? 1 : 0;
  const number = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(kwh);
  return unit ? `${number} kWh` : number;
}

/** kWh without decimals beyond what the scale needs, for chart axes. */
export function formatKwhAxis(wh: number, locale: Locale): string {
  const kwh = wh / 1000;
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: Math.abs(kwh) < 10 ? 1 : 0 }).format(kwh);
}

export const formatKw = (kw: number, locale: Locale) =>
  `${new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(kw)} kW`;

export const formatWatts = (w: number, locale: Locale) => `${new Intl.NumberFormat(intlLocale(locale)).format(w)} W`;

export const formatKwp = (kwp: number, locale: Locale) =>
  `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(kwp)} kWp`;

export const formatPercent = (ratio: number, locale: Locale) =>
  new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(ratio);

/** The day before a `YYYY-MM-DD` (an exclusive period end → its last day). */
const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Heading of a period: "Thursday 01/10/2026", "28/09/2026 – 04/10/2026", "October 2026", "2026". */
export function formatPeriod(period: EnergyPeriod, from: string, to: string, locale: Locale): string {
  switch (period) {
    case "day":
      return formatDate(from, locale, { weekday: "long" });
    case "week":
      return formatDateRange(from, dayBefore(to), locale);
    case "month":
      return formatMonthHeader(from, locale);
    case "year":
      return from.slice(0, 4);
  }
}

/** Axis label and tooltip title of one bucket (`YYYY-MM-DDTHH:MM`, `YYYY-MM-DD` or `YYYY-MM`). */
export function formatBucket(label: string, period: EnergyPeriod, locale: Locale): { short: string; long: string } {
  if (period === "day") {
    const hour = Number(label.slice(11, 13));
    const pad = (value: number) => String(value).padStart(2, "0");
    return { short: `${pad(hour)}h`, long: `${pad(hour)}:00 – ${pad((hour + 1) % 24)}:00` };
  }
  if (period === "year") {
    return { short: formatMonthName(Number(label.slice(5, 7)), locale, "short"), long: formatMonthHeader(label, locale) };
  }
  return {
    short: period === "week" ? formatWeekday(label, locale, "short") : String(Number(label.slice(8, 10))),
    long: formatDate(label, locale, { weekday: "long" }),
  };
}

/** `YYYY-MM` → "October 2026". */
export const formatMonth = (month: string, locale: Locale) => formatMonthHeader(month, locale);

/** Litres → "1.234,5 m³" (gas and water meters show m³). */
export function formatM3(litres: number, locale: Locale): string {
  const m3 = litres / 1000;
  const digits = Math.abs(m3) < 100 ? 2 : Math.abs(m3) < 1000 ? 1 : 0;
  return `${new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(m3)} m³`;
}

/** Calorific value: "11,4 kWh/m³". */
export const formatCalorific = (kwhPerM3: number, locale: Locale) =>
  `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 3 }).format(kwhPerM3)} kWh/m³`;
