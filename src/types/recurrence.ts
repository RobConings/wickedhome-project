import { addDays, addMonthsClamped, daysBetween } from "./dates";

/**
 * Shared RFC 5545 RRULE support for every feature that repeats things (calendar events, bills, tasks…).
 * Pure TypeScript, no React: the API and the screens expand rules identically. Dates are `YYYY-MM-DD`
 * calendar dates in the household time zone; the rule's DTSTART is passed separately (it is the first
 * occurrence, e.g. an event's start date or a task's first due date).
 *
 * Supported subset:
 *
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY ; INTERVAL=n ; COUNT=n | UNTIL=YYYYMMDD[THHMMSSZ] ; WKST=MO
 *   BYDAY=MO,TU,…                                   WEEKLY only, no ordinals (2MO…)
 *   BYMONTH=m,… ; BYMONTHDAY=d ; BYSETPOS=1|-1      YEARLY only: a seasonal window (see below)
 *
 * Expansion follows the RFC:
 * - WEEKLY without BYDAY repeats on DTSTART's weekday; with BYDAY on each listed day of every n-th week
 *   (weeks start on Monday). Days before DTSTART in the first week are skipped.
 * - MONTHLY repeats on DTSTART's day of the month; YEARLY on DTSTART's month and day. A day that doesn't
 *   exist in a month is skipped (RFC), or falls on the month's last day with `monthEnd: "clamp"` (how
 *   bills behave: a bill on the 31st is still due in February).
 * - COUNT counts occurrences from DTSTART. UNTIL is read as a date in the household time zone and is
 *   inclusive (a time part is ignored).
 *
 * Seasonal windows ("every spring") are plain RFC as well: `FREQ=YEARLY;BYMONTH=3,4,5;BYMONTHDAY=1;BYSETPOS=1`
 * yields one occurrence per year, on 1 March: the first day of the window. BYMONTH must be consecutive
 * months; a window over New Year (winter: 12,1,2) uses BYSETPOS=-1, so any RFC-compliant expander also
 * lands on 1 December. The months themselves tell the UI how long the window lasts ("March–May").
 *
 * Anything else (BYHOUR, ordinals, BYSETPOS on other rules…) is rejected, so it can't be stored by accident.
 */
export const RRULE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RRuleFrequency = (typeof RRULE_FREQUENCIES)[number];

/** RFC 5545 weekday codes, Monday first (index = `weekdayIndex`). */
export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** Meteorological seasons, as Belgian weather reports use them. */
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** Months of each season, first month first. */
export const SEASON_MONTHS: Record<Season, readonly number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

export type RRule = {
  freq: RRuleFrequency;
  interval: number;
  count?: number;
  /** Last possible occurrence date, `YYYY-MM-DD`, inclusive. */
  until?: string;
  /** WEEKLY only, Monday first, no duplicates. */
  byDay?: WeekdayCode[];
  /**
   * YEARLY only: a window of consecutive months, in window order (winter is `[12, 1, 2]`). One
   * occurrence per year, in the window's first month.
   */
  byMonth?: number[];
  /** With `byMonth` only: day of the month of the occurrence. Defaults to DTSTART's day. */
  byMonthDay?: number;
};

/** What a feature accepts. Everything is allowed when omitted. */
export type RRuleSupport = {
  frequencies?: readonly RRuleFrequency[];
  /** Weekly rules on specific weekdays. */
  byDay?: boolean;
  /** Seasonal windows (BYMONTH). */
  seasons?: boolean;
  /** COUNT / UNTIL. */
  end?: boolean;
};

/** What to do with a monthly/yearly day that doesn't exist (31 April): RFC skips it, bills clamp it. */
export type MonthEndPolicy = "skip" | "clamp";

export type ExpandOptions = {
  /** First date to return (inclusive). Defaults to DTSTART. */
  from?: string;
  /** Last date to return (inclusive). */
  to: string;
  /** Stop after this many dates. */
  limit?: number;
  monthEnd?: MonthEndPolicy;
};

export const MAX_INTERVAL = 99;
export const MAX_COUNT = 999;
const KNOWN_KEYS = ["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST", "BYMONTH", "BYMONTHDAY", "BYSETPOS"];

// ── Small date helpers ────────────────────────────────────────────────────────────────────────────────

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The RFC weekday code of a date, e.g. `"SA"`. */
export const weekdayCodeOf = (date: string): WeekdayCode => WEEKDAY_CODES[weekdayIndex(date)] ?? "MO";

const startOfWeek = (date: string) => addDays(date, -weekdayIndex(date));
const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` for a year, month (1–12) and day, or `null` when that day doesn't exist. */
function dateOf(year: number, month: number, day: number): string | null {
  const monthIndex = month - 1;
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth();
  if (day < 1 || day > daysInMonth(y, m)) return null;
  return `${String(y).padStart(4, "0")}-${pad(m + 1)}-${pad(day)}`;
}

function parseUntil(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  // Rejects impossible dates like 20260231, which Date would silently roll over.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

const positiveInt = (value: string, max: number): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= max ? number : null;
};

// ── Month windows (seasons) ───────────────────────────────────────────────────────────────────────────

/**
 * Orders a set of months as a window of consecutive months (wrapping over New Year), first month
 * first, e.g. `[1, 2, 12]` → `[12, 1, 2]`. `null` when the months aren't consecutive or cover the year.
 */
export function monthWindowOrder(months: readonly number[]): number[] | null {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length >= 12) return null;
  if (sorted.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) return null;
  if (sorted.length === 1) return sorted;
  const gaps = sorted.flatMap((month, index) => {
    const next = sorted[(index + 1) % sorted.length] ?? month;
    return (next - month + 12) % 12 === 1 ? [] : [index];
  });
  if (gaps.length !== 1) return null;
  const start = ((gaps[0] ?? 0) + 1) % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}

/** Whether a month window runs over New Year (December → January). */
const wrapsNewYear = (window: readonly number[]) => window.length > 1 && (window[0] ?? 0) > (window[window.length - 1] ?? 0);

/** First and last month (1–12) of a seasonal rule's window, or `null` for other rules. */
export function monthWindow(rule: Pick<RRule, "byMonth">): { start: number; end: number } | null {
  if (!rule.byMonth?.length) return null;
  return { start: rule.byMonth[0] ?? 1, end: rule.byMonth[rule.byMonth.length - 1] ?? 1 };
}

/** The season a rule's window matches exactly, or `null`. */
export function seasonOf(rule: Pick<RRule, "byMonth">): Season | null {
  if (!rule.byMonth?.length) return null;
  const key = rule.byMonth.join(",");
  return SEASONS.find((season) => SEASON_MONTHS[season].join(",") === key) ?? null;
}

/** A yearly rule for a season, occurring on the 1st of its first month. */
export function seasonRRule(season: Season, options: { interval?: number; count?: number; until?: string } = {}): RRule {
  return {
    freq: "YEARLY",
    interval: options.interval ?? 1,
    byMonth: [...SEASON_MONTHS[season]],
    byMonthDay: 1,
    ...(options.count !== undefined && { count: options.count }),
    ...(options.until !== undefined && { until: options.until }),
  };
}

/** The next date on or after `from` on which a season starts (the 1st of its first month). */
export function nextSeasonStart(season: Season, from: string): string {
  const month = SEASON_MONTHS[season][0] ?? 1;
  const year = Number(from.slice(0, 4));
  const thisYear = dateOf(year, month, 1) ?? from;
  return thisYear >= from ? thisYear : (dateOf(year + 1, month, 1) ?? from);
}

// ── Parse & format ────────────────────────────────────────────────────────────────────────────────────

/**
 * Parses the supported subset; `null` for anything else or anything `support` excludes. Accepts an
 * optional `RRULE:` prefix and any letter case.
 */
export function parseRRule(text: string, support: RRuleSupport = {}): RRule | null {
  const parts = text.trim().replace(/^RRULE:/i, "").split(";").filter(Boolean);
  const values = new Map<string, string>();
  for (const part of parts) {
    const [key, value, ...rest] = part.split("=");
    if (!key || !value || rest.length > 0) return null;
    const upper = key.toUpperCase();
    if (values.has(upper) || !KNOWN_KEYS.includes(upper)) return null;
    values.set(upper, value.toUpperCase());
  }

  const freq = values.get("FREQ");
  if (!freq || !(RRULE_FREQUENCIES as readonly string[]).includes(freq)) return null;
  const rule: RRule = { freq: freq as RRuleFrequency, interval: 1 };
  if (support.frequencies && !support.frequencies.includes(rule.freq)) return null;

  const wkst = values.get("WKST");
  if (wkst !== undefined && wkst !== "MO") return null;

  const interval = values.get("INTERVAL");
  if (interval !== undefined) {
    const value = positiveInt(interval, MAX_INTERVAL);
    if (value === null) return null;
    rule.interval = value;
  }

  const count = values.get("COUNT");
  const until = values.get("UNTIL");
  if (count !== undefined && until !== undefined) return null; // RFC 5545: mutually exclusive
  if ((count !== undefined || until !== undefined) && support.end === false) return null;
  if (count !== undefined) {
    const value = positiveInt(count, MAX_COUNT);
    if (value === null) return null;
    rule.count = value;
  }
  if (until !== undefined) {
    const date = parseUntil(until);
    if (!date) return null;
    rule.until = date;
  }

  const byDay = values.get("BYDAY");
  if (byDay !== undefined) {
    if (rule.freq !== "WEEKLY" || support.byDay === false) return null;
    const days = byDay.split(",");
    if (days.some((day) => !(WEEKDAY_CODES as readonly string[]).includes(day))) return null;
    if (new Set(days).size !== days.length) return null;
    rule.byDay = WEEKDAY_CODES.filter((code) => days.includes(code));
  }

  const byMonth = values.get("BYMONTH");
  const byMonthDay = values.get("BYMONTHDAY");
  const bySetPos = values.get("BYSETPOS");
  if (byMonth === undefined) {
    if (byMonthDay !== undefined || bySetPos !== undefined) return null;
  } else {
    if (rule.freq !== "YEARLY" || support.seasons === false) return null;
    const months = byMonth.split(",").map((month) => positiveInt(month, 12));
    if (months.some((month) => month === null)) return null;
    if (new Set(months).size !== months.length) return null;
    const window = monthWindowOrder(months as number[]);
    if (!window) return null;
    // BYSETPOS picks the window's first month out of the calendar-year set; required for longer windows.
    const expected = wrapsNewYear(window) ? "-1" : "1";
    if (window.length > 1 ? bySetPos !== expected : bySetPos !== undefined && bySetPos !== "1" && bySetPos !== "-1") {
      return null;
    }
    rule.byMonth = window;
    if (byMonthDay !== undefined) {
      const day = positiveInt(byMonthDay, 31);
      if (day === null) return null;
      rule.byMonthDay = day;
    }
  }
  return rule;
}

export const isValidRRule = (text: string, support?: RRuleSupport) => parseRRule(text, support) !== null;

/** Canonical RRULE string, e.g. `FREQ=WEEKLY;BYDAY=MO,WE`. INTERVAL=1 is omitted. */
export function formatRRule(rule: RRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "WEEKLY" && rule.byDay?.length) {
    parts.push(`BYDAY=${WEEKDAY_CODES.filter((code) => rule.byDay?.includes(code)).join(",")}`);
  }
  const window = rule.freq === "YEARLY" && rule.byMonth?.length ? monthWindowOrder(rule.byMonth) : null;
  if (window) {
    parts.push(`BYMONTH=${[...window].sort((a, b) => a - b).join(",")}`);
    if (rule.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
    if (window.length > 1) parts.push(`BYSETPOS=${wrapsNewYear(window) ? -1 : 1}`);
  }
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${rule.until.replaceAll("-", "")}`);
  return parts.join(";");
}

// ── Expansion ─────────────────────────────────────────────────────────────────────────────────────────

/** The date `months` months after `start` on `start`'s day: `null` (skip) or the month's last day (clamp). */
function sameDayMonthsLater(start: string, months: number, monthEnd: MonthEndPolicy): string | null {
  if (monthEnd === "clamp") return addMonthsClamped(start, months);
  const [year = 1970, month = 1, day = 1] = start.split("-").map(Number);
  return dateOf(year, month + months, day);
}

/** The occurrence of a seasonal rule in `year`: RFC BYMONTH × BYMONTHDAY, then BYSETPOS ±1. */
function seasonalDate(rule: RRule, window: number[], year: number, day: number, monthEnd: MonthEndPolicy): string | null {
  const candidates = window
    .flatMap((month) => {
      const date = dateOf(year, month, day);
      if (date) return [date];
      return monthEnd === "clamp" ? [dateOf(year, month, daysInMonth(year, month - 1)) ?? ""] : [];
    })
    .filter(Boolean)
    .sort();
  if (candidates.length === 0) return null;
  return wrapsNewYear(window) ? (candidates[candidates.length - 1] ?? null) : (candidates[0] ?? null);
}

/**
 * Candidate dates of period `n` (0 = the period containing DTSTART), oldest first, before COUNT/UNTIL.
 * `periodStart` is the first day of the period, used to know when to stop.
 */
function periodDates(rule: RRule, start: string, n: number, monthEnd: MonthEndPolicy): { periodStart: string; dates: string[] } {
  switch (rule.freq) {
    case "DAILY": {
      const date = addDays(start, rule.interval * n);
      return { periodStart: date, dates: [date] };
    }
    case "WEEKLY": {
      const periodStart = addDays(startOfWeek(start), 7 * rule.interval * n);
      const days = rule.byDay?.length ? rule.byDay.map((code) => WEEKDAY_CODES.indexOf(code)) : [weekdayIndex(start)];
      return { periodStart, dates: days.map((day) => addDays(periodStart, day)).filter((date) => date >= start) };
    }
    case "MONTHLY":
    case "YEARLY": {
      if (rule.freq === "YEARLY" && rule.byMonth?.length) {
        const year = Number(start.slice(0, 4)) + rule.interval * n;
        const day = rule.byMonthDay ?? Number(start.slice(8, 10));
        const date = seasonalDate(rule, rule.byMonth, year, day, monthEnd);
        return { periodStart: dateOf(year, 1, 1) ?? start, dates: date && date >= start ? [date] : [] };
      }
      const months = (rule.freq === "MONTHLY" ? 1 : 12) * rule.interval * n;
      const date = sameDayMonthsLater(start, months, monthEnd);
      const periodStart = sameDayMonthsLater(`${start.slice(0, 8)}01`, months, "skip") ?? start;
      return { periodStart, dates: date ? [date] : [] };
    }
  }
}

/** Without COUNT, whole periods before `from` can be skipped instead of walked one by one. */
function firstUsefulPeriod(rule: RRule, start: string, from: string): number {
  if (rule.count !== undefined || from <= start) return 0;
  const days = daysBetween(start, from);
  const periodDays = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[rule.freq];
  return Math.max(0, Math.floor(days / (periodDays * rule.interval)) - 1);
}

/**
 * Occurrence dates of a rule with DTSTART `start` between `from` and `to` (both inclusive), oldest first.
 * Respects COUNT and UNTIL; stops after `limit` results.
 */
export function expandRRule(rule: RRule, start: string, { from = start, to, limit = 1000, monthEnd = "skip" }: ExpandOptions): string[] {
  const result: string[] = [];
  let seen = 0;
  // A rule that never matches (e.g. the 31st every 12 months from a short month) can't loop forever.
  const maxPeriods = 100_000;
  for (let n = firstUsefulPeriod(rule, start, from); n < maxPeriods; n++) {
    const { periodStart, dates } = periodDates(rule, start, n, monthEnd);
    if (periodStart > to || (rule.until !== undefined && periodStart > rule.until)) break;
    for (const date of dates) {
      if (rule.count !== undefined && seen >= rule.count) return result;
      if (date > to || (rule.until !== undefined && date > rule.until)) return result;
      seen++;
      if (date >= from) {
        result.push(date);
        if (result.length >= limit) return result;
      }
    }
  }
  return result;
}

/** First occurrence on or after `from`, or `null` when the rule has ended. */
export function nextOccurrence(rule: RRule, start: string, from: string, options: { monthEnd?: MonthEndPolicy } = {}): string | null {
  // A yearly rule is the sparsest; 100 years per interval step ahead is plenty to find the next one.
  const to = addMonthsClamped(from < start ? start : from, 1200 * rule.interval);
  const [next] = expandRRule(rule, start, { from, to, limit: 1, monthEnd: options.monthEnd });
  return next ?? null;
}

/** Convenience for strings; an invalid or missing rule yields only DTSTART when it falls in the range. */
export function occurrencesOf(rrule: string | null | undefined, start: string, options: ExpandOptions): string[] {
  const rule = rrule ? parseRRule(rrule) : null;
  if (!rule) return start >= (options.from ?? start) && start <= options.to ? [start] : [];
  return expandRRule(rule, start, options);
}
