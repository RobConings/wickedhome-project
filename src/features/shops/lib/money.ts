import type { Locale } from "@/types/common";
import { intlLocale } from "./format";

/**
 * Parses an amount typed by a person into integer cents. Belgian notation first ("12,50", "1.234,56"),
 * but "12.50", "1,234.56", "€ 12" and spaces work too. Returns `null` for anything that isn't a
 * non-negative amount with at most two decimals.
 */
export function parseMoneyToCents(input: string): number | null {
  let text = input.replace(/[€\s]/g, "").replace(/^EUR/i, ""); // \s also covers (narrow) no-break spaces
  if (text === "") return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the last one is the decimal separator, the other groups thousands.
    const decimal = lastComma > lastDot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    text = text.replaceAll(grouping, "").replace(decimal, ".");
  } else if (lastComma !== -1) {
    // Comma only: always the decimal separator in Belgium.
    text = text.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // Dot only, in groups of three ("1.234"): thousands.
    text = text.replaceAll(".", "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [euros = "0", cents = ""] = text.split(".");
  const value = Number(euros) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** Cents as an editable amount without currency sign or grouping: 1250 → "12,50". */
export function formatCentsForInput(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}
