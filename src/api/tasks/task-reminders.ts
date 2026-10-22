import { zonedParts, zonedToUtc } from "@/features/calendar/types/calendar-time";
import { onDutyIds, taskPath, taskReminderMoment, taskWhenKind } from "@/features/tasks/types/tasks";
import type { Locale } from "@/types/common";
import { formatDate } from "@/types/date-format";
import { registerJob } from "../jobs/job-registry";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { formatDay } from "../notifications/notification-text";
import { notify } from "../notifications/notify";

/*
 * Task reminders ("Remind me at 21:00 to put the bins out", docs/NOTIFICATIONS.md):
 *
 * - A task with a due date can have `reminderMinutes` (0 = at the start, N = N minutes before). The start is
 *   its time (a timeslot: the start time) on the due date; an all-day task (one day or several) counts back from
 *   09:00 on its (first) day (`reminderAnchor`). All-day tasks never get a reminder unless one is chosen.
 *   The tasks service keeps `remindAt` (that instant, Europe/Brussels) in sync whenever the date, time or
 *   reminder changes, and for every new occurrence of a recurring task; `remindedAt` is cleared then.
 * - The job `tasks.reminders` runs every minute: it picks open tasks with `remindedAt IS NULL AND remindAt <= now`
 *   (an index), claims each one by setting `remindedAt` (so two runs never send twice) and pushes
 *   "Reminder: <title>" with high priority to the people on duty, else the task's creator, else the household.
 * - Quiet hours don't hold it back: the person chose that moment (kind `bypassQuietHours`). Switching the kind
 *   off in Settings still stops it.
 * - After downtime: a reminder less than 30 minutes late is sent once (late); an older one is skipped and
 *   marked (`remindedAt` set), so a restart in the morning never sends last night's reminders.
 */

export const TASKS_REMINDER_KIND = "tasks.reminder";
/** A reminder this late (server down) is skipped instead of sent. */
export const REMINDER_MAX_LATE_MINUTES = 30;
const BATCH = 100;

registerNotificationKind({
  id: TASKS_REMINDER_KIND,
  group: "tasks",
  titleKey: "tasks:notifications.reminder.title",
  descriptionKey: "tasks:notifications.reminder.description",
  priority: "high",
  bypassQuietHours: true,
});

/** The "when" of a task as far as its reminder needs it. */
export type ReminderSchedule = { dueDate: string | null; dueTime: string | null; startDate?: string | null; reminderMinutes: number | null };

/** The instant of a reminder, or `null` when the task has no reminder (or no date). Pure. */
export function reminderInstant(task: ReminderSchedule): Date | null {
  const moment = taskReminderMoment(task);
  return moment ? zonedToUtc(moment.date, moment.time) : null;
}

/**
 * The reminder columns for a task's (new) schedule. `remindedAt` is cleared only when `remindAt` really moves,
 * so saving the form without touching the time doesn't send a reminder twice.
 */
export function reminderColumns(next: ReminderSchedule, current?: { remindAt: Date | null }): { remindAt: Date | null; remindedAt?: null } {
  const remindAt = reminderInstant(next);
  const moved = !current || (current.remindAt?.getTime() ?? null) !== (remindAt?.getTime() ?? null);
  return moved ? { remindAt, remindedAt: null } : { remindAt };
}

/** What to do with a due reminder at `now`: send it, or skip it because it is too late. Pure. */
export function reminderAction(remindAt: Date, now: Date): "send" | "skip" | "wait" {
  const late = now.getTime() - remindAt.getTime();
  if (late < 0) return "wait";
  return late > REMINDER_MAX_LATE_MINUTES * 60_000 ? "skip" : "send";
}

/** What a reminder says about a task: its title and "when". */
export type ReminderTask = {
  title: string;
  dueDate: string;
  dueTime: string | null;
  endTime?: string | null;
  startDate?: string | null;
  reminderMinutes: number;
};

/**
 * "Reminder: Wash Daan" / "Today at 18:00 · in 15 min"; a timeslot "Sat 10/10/2026 10:00–12:00 · in 1 h"; all
 * day "Today" or "za 10/10/2026"; several days "Today until 14/10/2026" or "12/10/2026 – 14/10/2026". Pure.
 */
export function reminderContent(task: ReminderTask, locale: Locale, now: Date): { title: string; body: string } {
  const today = zonedParts(now).date;
  const nl = locale === "nl";
  const kind = taskWhenKind(task);
  const dayText = (date: string) => (date === today ? (nl ? "Vandaag" : "Today") : formatDay(date, locale));
  let when: string;
  let start: Date | null = null;
  if (kind === "moment" && task.dueTime) {
    when = nl ? `${dayText(task.dueDate)} om ${task.dueTime}` : `${dayText(task.dueDate)} at ${task.dueTime}`;
    start = zonedToUtc(task.dueDate, task.dueTime);
  } else if (kind === "slot" && task.dueTime) {
    when = `${dayText(task.dueDate)} ${task.dueTime}–${task.endTime}`;
    start = zonedToUtc(task.dueDate, task.dueTime);
  } else if (kind === "days" && task.startDate) {
    when =
      task.startDate === today
        ? nl
          ? `Vandaag t/m ${formatDate(task.dueDate, locale)}`
          : `Today until ${formatDate(task.dueDate, locale)}`
        : `${formatDate(task.startDate, locale)} – ${formatDate(task.dueDate, locale)}`;
  } else {
    when = dayText(task.dueDate);
  }
  // "in 15 min" only counts down to a time; all-day tasks have none.
  const minutesLeft = start ? Math.round((start.getTime() - now.getTime()) / 60_000) : 0;
  const lead = minutesLeft >= 1 ? (nl ? `over ${leadText(minutesLeft, locale)}` : `in ${leadText(minutesLeft, locale)}`) : null;
  return {
    title: nl ? `Herinnering: ${task.title}` : `Reminder: ${task.title}`,
    body: [when, lead].filter(Boolean).join(" · "),
  };
}

function leadText(minutes: number, locale: Locale): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return locale === "nl" ? `${hours} u` : `${hours} h`;
  const days = Math.round(hours / 24);
  return locale === "nl" ? `${days} dagen` : `${days} days`;
}

/** Sends (or skips) every reminder that is due. Returns how many were sent and skipped. */
export async function sendDueReminders(now: Date, log: (message: string) => void, signal?: AbortSignal): Promise<{ sent: number; skipped: number }> {
  const due = await db.task.findMany({
    where: { remindedAt: null, remindAt: { lte: now }, status: "OPEN" },
    orderBy: { remindAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      householdId: true,
      title: true,
      dueDate: true,
      dueTime: true,
      endTime: true,
      startDate: true,
      reminderMinutes: true,
      remindAt: true,
      rotateAssignees: true,
      createdById: true,
      assignees: { select: { habitantId: true }, orderBy: { position: "asc" } },
    },
  });
  let sent = 0;
  let skipped = 0;
  for (const task of due) {
    if (signal?.aborted) break;
    if (!task.remindAt) continue;
    // Claim it first: a second run (or process) that finds the same row updates nothing and moves on.
    const { count } = await db.task.updateMany({
      where: { id: task.id, remindedAt: null, remindAt: task.remindAt },
      data: { remindedAt: now },
    });
    if (count === 0) continue;
    const dueDate = task.dueDate?.toISOString().slice(0, 10) ?? null;
    if (reminderAction(task.remindAt, now) === "skip" || !dueDate) {
      skipped += 1;
      log(`Skipped the reminder of task ${task.id}: due ${task.remindAt.toISOString()}, too late`);
      continue;
    }
    try {
      const onDuty = onDutyIds({ assigneeIds: task.assignees.map((assignee) => assignee.habitantId), rotateAssignees: task.rotateAssignees });
      const withAccount = onDuty.length
        ? await db.user.count({ where: { householdId: task.householdId, disabledAt: null, habitantId: { in: onDuty } } })
        : 0;
      // The people on duty; nobody (with an account): whoever created it; unknown: the household.
      const recipients = withAccount > 0 ? { habitantIds: onDuty } : task.createdById ? { userIds: [task.createdById], fallbackToHousehold: true } : {};
      const content: ReminderTask = {
        title: task.title,
        dueDate,
        dueTime: task.dueTime,
        endTime: task.endTime,
        startDate: task.startDate?.toISOString().slice(0, 10) ?? null,
        reminderMinutes: task.reminderMinutes ?? 0,
      };
      const result = await notify({
        householdId: task.householdId,
        kind: TASKS_REMINDER_KIND,
        ...recipients,
        url: taskPath(task.id),
        tag: `tasks:reminder:${task.id}:${task.remindAt.toISOString()}`,
        dedupeMinutes: 60,
        data: { taskId: task.id },
        content: (locale) => reminderContent(content, locale, now),
      });
      if (result.stored > 0) sent += 1;
    } catch (error) {
      // Not sent: let the next run try again (it skips it once it is too late).
      await db.task.updateMany({ where: { id: task.id, remindedAt: now }, data: { remindedAt: null } });
      log(`Reminder of task ${task.id} failed: ${(error as Error).message}`);
    }
  }
  return { sent, skipped };
}

registerJob({
  id: "tasks.reminders",
  // Every minute: reminders are set to the minute. The query is one index lookup when nothing is due.
  schedule: "* * * * *",
  titleKey: "tasks:jobs.reminders.title",
  descriptionKey: "tasks:jobs.reminders.description",
  timeoutMs: 55_000,
  // Most minutes nothing is due: those runs leave no row and no console line (Automations shows "Last check").
  recordIdleRuns: false,
  run: async ({ signal, log }) => {
    const { sent, skipped } = await sendDueReminders(new Date(), log, signal);
    return {
      summary: `${sent} reminder${sent === 1 ? "" : "s"} sent${skipped ? `, ${skipped} skipped (too late)` : ""}`,
      idle: sent === 0 && skipped === 0,
    };
  },
});
