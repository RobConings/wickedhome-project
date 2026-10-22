import { initials } from "@/lib/format";

/** Formatting for the account screens: relative times and readable device names. */

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

/** "jan.peeters@example.com" → "JP": also splits on `@` and `.`. */
export const accountInitials = (name: string) => initials(name, { separator: /[\s@.]+/, skipEmpty: true });
