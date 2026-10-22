import { addDays, addMonthsClamped, daysBetween } from "@/types/dates";

/**
 * Staples repeat with a small subset of RFC 5545 RRULE: `FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n`. The
 * staple's start date is DTSTART; occurrence n is start + n × interval, so dates never drift.
 */
export const STAPLE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type StapleFrequency = (typeof STAPLE_FREQUENCIES)[number];
export type StapleRRule = { freq: StapleFrequency; interval: number };

export function parseStapleRRule(rule: string): StapleRRule | null {
  const values = new Map<string, string>();
  for (const part of rule.trim().replace(/^RRULE:/i, "").split(";").filter(Boolean)) {
    const [key, value, ...rest] = part.split("=");
    if (!key || !value || rest.length > 0) return null;
    values.set(key.toUpperCase(), value.toUpperCase());
  }
  const freq = values.get("FREQ");
  if (!freq || !(STAPLE_FREQUENCIES as readonly string[]).includes(freq)) return null;
  for (const key of values.keys()) if (key !== "FREQ" && key !== "INTERVAL") return null;
  const interval = Number(values.get("INTERVAL") ?? "1");
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) return null;
  return { freq: freq as StapleFrequency, interval };
}

export const isValidStapleRRule = (rule: string) => parseStapleRRule(rule) !== null;

export function formatStapleRRule({ freq, interval }: StapleRRule): string {
  return interval === 1 ? `FREQ=${freq}` : `FREQ=${freq};INTERVAL=${interval}`;
}

const occurrence = (rule: StapleRRule, start: string, n: number) =>
  rule.freq === "MONTHLY"
    ? addMonthsClamped(start, n * rule.interval)
    : addDays(start, n * rule.interval * (rule.freq === "WEEKLY" ? 7 : 1));

/** The first occurrence strictly after `date` (or the start date when `date` lies before it). */
export function nextStapleOccurrence(rule: StapleRRule, start: string, date: string): string {
  if (date < start) return start;
  const stepDays = rule.freq === "DAILY" ? rule.interval : rule.freq === "WEEKLY" ? rule.interval * 7 : rule.interval * 28;
  let n = Math.max(0, Math.floor(daysBetween(start, date) / stepDays) - 1);
  while (occurrence(rule, start, n) <= date) n += 1;
  return occurrence(rule, start, n);
}
