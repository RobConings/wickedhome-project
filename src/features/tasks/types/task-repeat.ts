import { WEEKDAY_CODES, formatRRule, parseRRule, weekdayCodeOf, type RRule, type WeekdayCode } from "@/types/recurrence";

/**
 * The repeat presets of the task form ("Repeats" toggle): the common rules in one tap, everything else
 * under "Custom" (the shared `RecurrenceFields`). Pure, so the form and the tests agree on the mapping.
 */
/** `/tasks/<id>?repeat=1` opens the task's form with "Repeats" switched on ("Repeat this" in a task's menu). */
export const REPEAT_PARAM = "repeat";

export const REPEAT_PRESETS =["daily", "weekly", "biweekly", "monthly", "yearly", "custom"] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number];

/** Presets that map to one rule (everything but "custom"). */
export type SimpleRepeatPreset = Exclude<RepeatPreset, "custom">;

/** Weekly presets on these weekdays (Monday first); left out or empty: the start date's weekday. */
export type RepeatWeekdays = readonly WeekdayCode[] | null | undefined;

/** Weekdays in Monday-first order without duplicates; empty: the weekday of `startDate`. */
export function weekdaysOrStart(weekdays: RepeatWeekdays, startDate: string): WeekdayCode[] {
  const picked = WEEKDAY_CODES.filter((code) => weekdays?.includes(code));
  return picked.length ? picked : [weekdayCodeOf(startDate)];
}

/**
 * The rule of a preset, starting on `startDate`, with an optional end date. Weekly presets repeat on `weekdays`
 * ("every Sunday": `["SU"]`), by default on the start date's weekday; the tasks service then moves the first due
 * date to the first of those days on or after the start (`firstDueDate`).
 */
export function presetRRule(preset: SimpleRepeatPreset, startDate: string, until?: string | null, weekdays?: RepeatWeekdays): string {
  const end = until && until >= startDate ? { until } : {};
  const byDay = weekdaysOrStart(weekdays, startDate);
  const rules: Record<SimpleRepeatPreset, RRule> = {
    daily: { freq: "DAILY", interval: 1 },
    weekly: { freq: "WEEKLY", interval: 1, byDay },
    biweekly: { freq: "WEEKLY", interval: 2, byDay },
    monthly: { freq: "MONTHLY", interval: 1 },
    yearly: { freq: "YEARLY", interval: 1 },
  };
  return formatRRule({ ...rules[preset], ...end });
}

export type RepeatPresetValue = { preset: RepeatPreset; until: string | null; weekdays: WeekdayCode[] };

/**
 * Which preset a stored rule is, given the due date it starts from; `null` without a rule. Weekly and biweekly
 * rules keep their weekdays (any set of days); rules a preset can't express (other intervals, counts, seasons)
 * are "custom". An end date fits any preset.
 */
export function repeatPresetOf(rrule: string | null | undefined, startDate: string): RepeatPresetValue | null {
  if (!rrule) return null;
  const rule = parseRRule(rrule);
  const fallback = [weekdayCodeOf(startDate)];
  if (!rule) return { preset: "custom", until: null, weekdays: fallback };
  const until = rule.until ?? null;
  const weekdays = rule.byDay?.length ? [...rule.byDay] : fallback;
  if (rule.count !== undefined || rule.byMonth?.length) return { preset: "custom", until, weekdays };
  if (rule.freq === "DAILY" && rule.interval === 1) return { preset: "daily", until, weekdays };
  if (rule.freq === "WEEKLY" && rule.interval === 1) return { preset: "weekly", until, weekdays };
  if (rule.freq === "WEEKLY" && rule.interval === 2) return { preset: "biweekly", until, weekdays };
  if (rule.freq === "MONTHLY" && rule.interval === 1) return { preset: "monthly", until, weekdays };
  if (rule.freq === "YEARLY" && rule.interval === 1) return { preset: "yearly", until, weekdays };
  return { preset: "custom", until, weekdays };
}
