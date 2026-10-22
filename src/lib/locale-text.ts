import { formatDate, formatDateTime, formatMonth } from "@/types/date-format";
import { formatCurrency, formatRelativeTime } from "./format";
import { formatBytes } from "./format-bytes";
import { currentLocale } from "./i18n";

/**
 * Display text in the current language (Belgian formats). Features use these instead of defining their own
 * `money = (cents) => formatCurrency(cents, currentLocale())` wrappers. Components that already have a
 * `locale` call the `@/lib/format` / `@/types/date-format` functions directly.
 */

/** € 1.234,56 */
export const money = (cents: number) => formatCurrency(cents, currentLocale());

/** "+€ 123,45" / "−€ 123,45": always with a sign. */
export const signedMoney = (cents: number) => `${cents < 0 ? "−" : "+"}${formatCurrency(Math.abs(cents), currentLocale())}`;

/** A date (or the date of an instant): "12/10/2026". */
export const dateText = (date: string) => formatDate(date, currentLocale());

/** An instant: "12/10/2026 14:05". */
export const dateTimeText = (iso: string) => formatDateTime(iso, currentLocale());

/** "oktober 2026" */
export const monthLabel = (month: string) => formatMonth(month, currentLocale());

/** "1,2 MB" */
export const fileSize = (bytes: number) => formatBytes(bytes, currentLocale());

/** "5 minutes ago", "in 6 days", "yesterday"; a date after a month. */
export const relativeTimeText = (iso: string, now: number) => formatRelativeTime(iso, currentLocale(), now);
