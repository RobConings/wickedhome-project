import * as React from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { describeRecurrence, weekdayNames } from "@/lib/recurrence-format";
import { formatDate, formatDateTime, formatShortDateRange, formatWeekday } from "@/types/date-format";
import { addDays, daysBetween } from "@/types/dates";
import { WEEKDAY_CODES, parseRRule } from "@/types/recurrence";
import { ALL_DAY_REMINDER_TIME, dueState, taskReminderMoment, taskWhenKind, type Task } from "../types/tasks";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The columns of a task's "when". */
type WhenFields = Pick<Task, "dueDate"> & Partial<Pick<Task, "dueTime" | "endTime" | "startDate">>;

/** Only these are honoured: an optional weekday prefix, and (instants) a time. Dates are always dd/mm/yyyy. */
type TaskDateOptions = { weekday?: "short" | "long"; time?: boolean };

/** Display text for tasks: due labels, durations, repeat summaries. Dates are `YYYY-MM-DD`, shown as dd/mm/yyyy. */
export function useTaskText() {
  const { t } = useTranslation("tasks");
  const locale = currentLocale();

  return React.useMemo(() => {
    /** A calendar date: "12/10/2026", with `weekday` "za 12/10/2026". Never shifts a day. */
    const day = (date: string, { weekday }: TaskDateOptions = {}) => formatDate(date, locale, { weekday });

    /** An instant (ISO timestamp) in the household time zone: "12/10/2026", with `time` "12/10/2026 14:05". */
    const instant = (iso: string, { weekday, time }: TaskDateOptions = {}) =>
      time ? formatDateTime(iso, locale, { weekday }) : formatDate(iso, locale, { weekday });

    /** The time part of a task's "when": "18:00", a timeslot "10:00–12:00"; `null` when it is all day. */
    function timeText(task: WhenFields): string | null {
      const kind = taskWhenKind(task);
      if (kind === "moment") return task.dueTime ?? null;
      if (kind === "slot") return `${task.dueTime}–${task.endTime}`;
      return null;
    }

    /**
     * "3 days overdue", "Today", "Tomorrow · 20:00", "Saturday · 10:00–12:00", "12/10/2026", several days
     * "12/10 – 14/10", "No due date".
     */
    function dueLabel(task: Pick<Task, "status" | "dueDate"> & Partial<Pick<Task, "dueTime" | "endTime" | "startDate">>, today: string): string {
      const kind = taskWhenKind(task);
      if (kind === "days" && task.dueDate && task.startDate && dueState(task, today) !== "overdue") {
        return formatShortDateRange(task.startDate, task.dueDate, locale, today.slice(0, 4));
      }
      const label = dayLabel(task, today);
      const time = timeText(task);
      return time ? t("due.withTime", { label, time }) : label;
    }

    /**
     * The full "when" for a task's page: "zondag 05/10/2026 · 18:00", "zaterdag 10/10/2026 · 10:00–12:00",
     * "ma 12/10/2026 – wo 14/10/2026"; `null` without a date.
     */
    function whenText(task: WhenFields): string | null {
      if (!task.dueDate) return null;
      if (taskWhenKind(task) === "days" && task.startDate) {
        return `${day(task.startDate, { weekday: "short" })} – ${day(task.dueDate, { weekday: "short" })}`;
      }
      const time = timeText(task);
      const date = day(task.dueDate, { weekday: "long" });
      return time ? `${date} · ${time}` : date;
    }

    function dayLabel(task: Pick<Task, "status" | "dueDate">, today: string): string {
      if (!task.dueDate) return t("due.none");
      switch (dueState(task, today)) {
        case "overdue":
          return t("due.overdue", { count: daysBetween(task.dueDate, today) });
        case "today":
          return t("due.today");
        default:
          if (task.dueDate === addDays(today, 1)) return t("due.tomorrow");
          if (task.dueDate <= addDays(today, 6)) return capitalize(formatWeekday(task.dueDate, locale, "long"));
          return day(task.dueDate);
      }
    }

    /** "15 min", "1 h", "1 h 30 min". */
    function duration(minutes: number | null): string | null {
      if (!minutes) return null;
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      if (hours === 0) return t("duration.minutes", { count: rest });
      if (rest === 0) return t("duration.hours", { count: hours });
      return t("duration.hoursMinutes", { hours, minutes: rest });
    }

    /**
     * "Every Monday" / "Elke maandag" for plain weekly rules on set weekdays; otherwise the shared summary
     * ("Every 2 weeks on Monday", "Every month, until 30/06/2027").
     */
    function recurrence(rrule: string | null): string | null {
      const rule = rrule ? parseRRule(rrule) : null;
      if (!rule || rule.freq !== "WEEKLY" || rule.interval !== 1 || !rule.byDay?.length) return describeRecurrence(rrule, locale, t);
      const names = weekdayNames(locale, "long");
      const days = new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(
        rule.byDay.map((code) => names[WEEKDAY_CODES.indexOf(code)] ?? code),
      );
      let text = t("repeat.everyWeekday", { days });
      if (rule.until) text = t("common:recurrence.summary.until", { rule: text, date: day(rule.until) });
      if (rule.count) text = t("common:recurrence.summary.times", { rule: text, count: rule.count });
      return text;
    }

    /** "From waste collection", from the origin type (`tasks:origin.<type>`). */
    const origin = (type: string) => t(`origin.${type}`, { defaultValue: t("origin.other") });

    /**
     * A reminder choice: "At the time", "15 minutes before", "2 hours before", "1 day before". All-day tasks
     * count back from 09:00: "On the day at 09:00", "2 days before at 09:00".
     */
    function reminderOffset(minutes: number, allDay = false): string {
      if (allDay) {
        if (minutes === 0) return t("reminder.allDay.onTheDay", { time: ALL_DAY_REMINDER_TIME });
        if (minutes % 1440 === 0) return t("reminder.allDay.daysBefore", { count: minutes / 1440, time: ALL_DAY_REMINDER_TIME });
        return t("reminder.allDay.before", { offset: reminderOffset(minutes), time: ALL_DAY_REMINDER_TIME });
      }
      if (minutes === 0) return t("reminder.atTime");
      if (minutes % 1440 === 0) return t("reminder.daysBefore", { count: minutes / 1440 });
      if (minutes % 60 === 0) return t("reminder.hoursBefore", { count: minutes / 60 });
      return t("reminder.minutesBefore", { count: minutes });
    }

    /**
     * When the reminder rings, or `null` without one: "Reminder 20:45" on the (first) day itself, else with the
     * date ("Reminder 05/10/2026 21:00"). All-day tasks ring at 09:00.
     */
    function reminderLabel(task: WhenFields & Pick<Task, "reminderMinutes">): string | null {
      const moment = taskReminderMoment(task);
      if (!moment) return null;
      const first = task.startDate && task.dueDate && task.startDate < task.dueDate ? task.startDate : task.dueDate;
      return moment.date === first ? t("reminder.at", { time: moment.time }) : t("reminder.atDate", { date: day(moment.date), time: moment.time });
    }

    return { day, instant, dueLabel, whenText, timeText, duration, recurrence, origin, reminderOffset, reminderLabel };
  }, [t, locale]);
}
