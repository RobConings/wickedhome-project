/**
 * Turns the cron expressions jobs use into a structure the UI can put in words ("Every day at 05:15",
 * "Elke maandag om 07:00"). Covers the common shapes; anything else is `custom` and shown as the expression.
 */

export type ScheduleDescription =
  | { kind: "everyMinutes"; interval: number }
  | { kind: "hourly"; minute: number }
  | { kind: "everyHours"; interval: number; minute: number }
  | { kind: "daily"; times: string[] }
  | { kind: "weekdays"; times: string[] }
  /** `days`: 0 = Sunday … 6 = Saturday, sorted from Monday. */
  | { kind: "weekly"; days: number[]; times: string[] }
  | { kind: "monthly"; day: number; times: string[] }
  | { kind: "custom"; expression: string };

const INTEGER = /^\d+$/;
const pad = (value: number) => String(value).padStart(2, "0");

/** "5", "1,15", "1-5" → numbers; null for steps, names or anything out of range. */
function parseList(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const range = part.split("-");
    if (range.length > 2 || !range.every((value) => INTEGER.test(value))) return null;
    const from = Number(range[0]);
    const to = Number(range[1] ?? range[0]);
    if (from < min || to > max || from > to) return null;
    for (let value = from; value <= to; value += 1) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

const step = (field: string): number | null => {
  const match = /^\*\/(\d+)$/.exec(field);
  return match ? Number(match[1]) : null;
};

/** Monday first, as the week starts in Belgium. */
const mondayFirst = (day: number) => (day + 6) % 7;

export function describeSchedule(expression: string): ScheduleDescription {
  const custom: ScheduleDescription = { kind: "custom", expression };
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return custom;
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = fields;
  if (month !== "*") return custom;

  if (dayOfMonth === "*" && dayOfWeek === "*") {
    if (hour === "*") {
      if (minute === "*") return { kind: "everyMinutes", interval: 1 };
      const minuteStep = step(minute);
      if (minuteStep) return { kind: "everyMinutes", interval: minuteStep };
      if (INTEGER.test(minute) && Number(minute) < 60) return { kind: "hourly", minute: Number(minute) };
      return custom;
    }
    const hourStep = step(hour);
    if (hourStep && INTEGER.test(minute) && Number(minute) < 60) return { kind: "everyHours", interval: hourStep, minute: Number(minute) };
  }

  const minutes = parseList(minute, 0, 59);
  const hours = parseList(hour, 0, 23);
  if (!minutes || !hours || minutes.length * hours.length > 6) return custom;
  const times = hours.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`));

  if (dayOfMonth === "*" && dayOfWeek === "*") return { kind: "daily", times };
  if (dayOfMonth === "*") {
    const days = parseList(dayOfWeek, 0, 7);
    if (!days) return custom;
    const unique = [...new Set(days.map((day) => day % 7))].sort((a, b) => mondayFirst(a) - mondayFirst(b));
    if (unique.length === 7) return { kind: "daily", times };
    if (unique.join(",") === "1,2,3,4,5") return { kind: "weekdays", times };
    return { kind: "weekly", days: unique, times };
  }
  if (dayOfWeek === "*" && INTEGER.test(dayOfMonth)) {
    const day = Number(dayOfMonth);
    if (day >= 1 && day <= 31) return { kind: "monthly", day, times };
  }
  return custom;
}
