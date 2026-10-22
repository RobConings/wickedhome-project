import type { CalendarOverlayItem } from "@/features/calendar/types/calendar";
import { db } from "../lib/db";
import type { CalendarSource } from "./calendar-sources";

/** The birthday in `year`; 29 February falls on 28 February in other years. */
export function birthdayInYear(birthday: string, year: number): string {
  const monthDay = birthday.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-${monthDay === "02-29" && !leap ? "02-28" : monthDay}`;
}

/** Birthdays of `habitants` between `from` and `to` (inclusive), with the age they turn. */
export function birthdayItems(
  habitants: { id: string; name: string; color: string; birthday: string }[],
  from: string,
  to: string,
): CalendarOverlayItem[] {
  const items: CalendarOverlayItem[] = [];
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  for (const habitant of habitants) {
    const birthYear = Number(habitant.birthday.slice(0, 4));
    for (let year = Math.max(firstYear, birthYear + 1); year <= lastYear; year++) {
      const date = birthdayInYear(habitant.birthday, year);
      if (date < from || date > to) continue;
      items.push({
        id: `${habitant.id}:${year}`,
        kind: "birthday",
        title: habitant.name,
        allDay: true,
        start: date,
        color: habitant.color,
        participantIds: [habitant.id],
        href: "/habitants",
        meta: { age: year - birthYear },
      });
    }
  }
  return items;
}

/** First calendar source: habitants' birthdays, from the Habitant model's `birthday`. */
export const birthdaysSource: CalendarSource = {
  id: "birthdays",
  kind: "birthday",
  async load({ householdId, from, to }) {
    const rows = await db.habitant.findMany({
      where: { householdId, birthday: { not: null } },
      select: { id: true, name: true, color: true, birthday: true },
    });
    const habitants = rows.flatMap((row) =>
      row.birthday ? [{ ...row, birthday: row.birthday.toISOString().slice(0, 10) }] : [],
    );
    return birthdayItems(habitants, from, to);
  },
};
