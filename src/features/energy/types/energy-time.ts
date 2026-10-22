import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";

/**
 * Wall-clock ↔ instant conversion for the household time zone, DST-aware. Pure (Intl only), so the CSV
 * parser in the browser and the API compute the same instants. Belgian meter data is in local time without
 * an offset: the autumn hour 02:00–03:00 happens twice and the spring hour 02:00–03:00 never.
 */

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, value);
  }
  return value;
}

/** Wall clock in `timeZone` at an instant (epoch milliseconds). */
export function wallClockAt(instant: number, timeZone: string = HOUSEHOLD_TIME_ZONE): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

const asUtc = (clock: WallClock) => Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);

/**
 * Every instant at which the wall clock shows `clock`, earliest first: one normally, two in the repeated
 * autumn hour, none in the skipped spring hour.
 */
export function wallClockInstants(clock: WallClock, timeZone: string = HOUSEHOLD_TIME_ZONE): number[] {
  const local = asUtc(clock);
  const offsets = new Set<number>();
  for (const probe of [local - 86_400_000, local, local + 86_400_000]) {
    offsets.add(asUtc(wallClockAt(probe, timeZone)) - Math.floor(probe / 60_000) * 60_000);
  }
  return [...offsets]
    .map((offset) => local - offset)
    .filter((instant) => asUtc(wallClockAt(instant, timeZone)) === local)
    .sort((a, b) => a - b);
}

/**
 * One instant for a wall-clock time: `occurrence` 0 = the first (summer time) of a repeated hour, 1 = the
 * second. A skipped time moves forward by the gap (02:30 on the spring day → 03:30).
 */
export function wallClockToInstant(clock: WallClock, occurrence = 0, timeZone: string = HOUSEHOLD_TIME_ZONE): number {
  const instants = wallClockInstants(clock, timeZone);
  if (instants.length > 0) return instants[Math.min(occurrence, instants.length - 1)] ?? 0;
  // In a gap: shift by an hour and keep the same offset as before the gap.
  const later = wallClockInstants({ ...clock, hour: clock.hour + 1 }, timeZone);
  return later[0] ?? asUtc(clock);
}

/** `YYYY-MM-DD` + `HH:MM` in the household time zone → ISO timestamp (first occurrence when ambiguous). */
export function zonedDateTimeToIso(date: string, time: string, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Date(wallClockToInstant({ year, month, day, hour, minute }, 0, timeZone)).toISOString();
}

/** Start of a calendar day (local midnight) in the household time zone, as an instant. */
export const zonedMidnight = (date: string, timeZone: string = HOUSEHOLD_TIME_ZONE) =>
  new Date(zonedDateTimeToIso(date, "00:00", timeZone));

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Local `YYYY-MM-DD` and `HH:MM` of an instant in the household time zone. */
export function zonedDateTime(instant: Date | string, timeZone: string = HOUSEHOLD_TIME_ZONE) {
  const clock = wallClockAt(typeof instant === "string" ? Date.parse(instant) : instant.getTime(), timeZone);
  return {
    date: `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}`,
    time: `${pad(clock.hour)}:${pad(clock.minute)}`,
  };
}
