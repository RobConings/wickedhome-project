import { zonedParts, zonedToUtc } from "@/features/calendar/types/calendar-time";
import { AT_TASK_TIME } from "@/features/notifications/types/notifications";
import { wasteDayTitle } from "@/features/waste/types/waste";
import { addDays } from "@/types/dates";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { isTimeDue } from "../notifications/notification-policy";
import { formatDay } from "../notifications/notification-text";
import { notify } from "../notifications/notify";
import { recipientsWithTime, registerScheduledNotifier } from "../notifications/scheduled-notifiers";
import { listLinkedTasks, type LinkedTaskState } from "../tasks/linked-tasks";
import { getWasteDays } from "./waste.service";
import { WASTE_ORIGIN } from "./waste-tasks";

/*
 * "Put out tonight: Papier & karton + Pmd" (docs/NOTIFICATIONS.md): for every open bins task (one per
 * collection day, see waste-tasks.ts), to its assignees, or everyone when nobody (with an account) is
 * assigned. When: at the task's own time (20:00 the evening before, or 07:00 that morning), or at the
 * evening-before time the person chose. Once per collection day and person (tag), and never for a task
 * that is already done.
 */

export const WASTE_BINS_KIND = "waste.bins";

registerNotificationKind({
  id: WASTE_BINS_KIND,
  group: "household",
  titleKey: "waste:notifications.bins.title",
  descriptionKey: "waste:notifications.bins.description",
  times: [AT_TASK_TIME, "18:00", "19:00", "20:00", "21:00"],
  defaultTime: AT_TASK_TIME,
  priority: "high",
});

/** Notify for the task's time this long after it (a later restart doesn't send a stale "tonight"). */
const GRACE_MINUTES = 4 * 60;

/**
 * Is it time to tell this person about this bins task? `time` is the person's choice: `task` (the task's due
 * date and time) or `HH:MM` on the evening before the collection. Pure.
 */
export function binsReminderDue(task: Pick<LinkedTaskState, "originDate" | "dueDate" | "dueTime">, time: string | null, now: Date): boolean {
  if (!task.originDate) return false;
  if (!time || time === AT_TASK_TIME) {
    if (!task.dueDate) return false;
    const due = zonedToUtc(task.dueDate, task.dueTime ?? "20:00").getTime();
    return now.getTime() >= due && now.getTime() < due + GRACE_MINUTES * 60_000;
  }
  const { date } = zonedParts(now);
  return date === addDays(task.originDate, -1) && isTimeDue(time, now);
}

async function notifyHousehold(householdId: string, now: Date): Promise<number> {
  const today = zonedParts(now).date;
  const tasks = (await listLinkedTasks(householdId, WASTE_ORIGIN)).filter(
    (task) => task.status === "open" && task.originDate !== null && task.originDate >= today && task.originDate <= addDays(today, 1),
  );
  let stored = 0;
  for (const task of tasks) {
    const date = task.originDate ?? today;
    const recipients = await recipientsWithTime({ householdId, habitantIds: task.assigneeIds, fallbackToHousehold: true }, WASTE_BINS_KIND);
    const due = recipients.filter((recipient) => binsReminderDue(task, recipient.time, now));
    if (due.length === 0) continue;
    const [day] = await getWasteDays(householdId, date, date);
    const what = day ? wasteDayTitle(day.collections) : task.title;
    const tomorrow = date > today;
    const result = await notify({
      householdId,
      kind: WASTE_BINS_KIND,
      userIds: due.map((recipient) => recipient.userId),
      tag: `waste:${date}`,
      dedupeMinutes: 24 * 60,
      url: `/tasks/${encodeURIComponent(task.id)}`,
      data: { date, taskId: task.id },
      content: (locale) =>
        locale === "nl"
          ? {
              title: `${tomorrow ? "Vanavond" : "Vandaag"} buitenzetten: ${what}`,
              body: tomorrow ? `Ophaling morgen, ${formatDay(date, "nl")}.` : "Ophaling vandaag.",
            }
          : {
              title: `Put out ${tomorrow ? "tonight" : "today"}: ${what}`,
              body: tomorrow ? `Collection tomorrow, ${formatDay(date, "en")}.` : "Collection today.",
            },
    });
    stored += result.stored;
  }
  return stored;
}

registerScheduledNotifier({
  id: WASTE_BINS_KIND,
  run: async ({ now, signal }) => {
    const households = await db.wasteSetup.findMany({ where: { taskEnabled: true }, select: { householdId: true } });
    let stored = 0;
    for (const { householdId } of households) {
      if (signal.aborted) break;
      stored += await notifyHousehold(householdId, now);
    }
    return stored;
  },
});
