import { intlLocale } from "@/lib/format";
import type { Locale } from "@/types/common";
import { formatDate } from "@/types/date-format";

/** Formatting for the account screens: relative times and readable device names. */

/** "5 minutes ago", "in 6 days", "yesterday"; a date after a month. */
export function relativeTime(iso: string, locale: Locale, now: number): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (abs < 45) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86_400) return format.format(Math.round(seconds / 86_400), "day");
  return formatDate(iso, locale);
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** "Chrome on Android", "Safari on iPhone"; `null` when the user agent says nothing useful. */
export function describeUserAgent(userAgent: string | null): { browser: string | null; system: string | null } {
  if (!userAgent) return { browser: null, system: null };
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  return { browser, system };
}

export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
