import type { Locale } from "@/types/common";
import { formatDate, formatTime } from "@/types/date-format";

/*
 * Small formatting helpers for notification texts, in the recipient's language with Belgian conventions
 * (nl-BE / en-BE): "€ 1.234,56", "wo 07/10/2026" / "Wed 07/10/2026" (dates via `@/types/date-format`). Plain spaces (Intl uses no-break spaces, which some
 * phones render oddly in notifications). Features use these when they build `content(locale)`.
 */

const INTL: Record<Locale, string> = { en: "en-BE", nl: "nl-BE" };
/** No-break space and narrow no-break space (U+00A0, U+202F). */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NO_BREAK_SPACES, " ");

/** "€ 52,30" */
export const formatMoney = (cents: number, locale: Locale) =>
  plain(new Intl.NumberFormat(INTL[locale], { style: "currency", currency: "EUR" }).format(cents / 100));

/** A `YYYY-MM-DD` date through `@/types/date-format`: "Wed 07/10/2026" / "wo 07/10/2026" (`weekday: false`: "07/10/2026"). */
export const formatDay = (date: string, locale: Locale, { weekday = true }: { weekday?: boolean } = {}) =>
  formatDate(date, locale, weekday ? { weekday: "short" } : {});

/** An instant's 24-hour wall-clock time in Brussels: "21:43". */
export const formatClock = (instant: Date, _locale?: Locale) => formatTime(instant);

/** "a, b and c" / "a, b en c"; with `max`, "a, b +3". */
export function listOf(items: string[], locale: Locale, max = items.length): string {
  if (items.length > max) return `${items.slice(0, max).join(", ")} +${items.length - max}`;
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${locale === "nl" ? "en" : "and"} ${items.at(-1)}`;
}
