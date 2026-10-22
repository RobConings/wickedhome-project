import type { SessionUser } from "@/features/auth/types/auth";
import { zonedParts } from "@/features/calendar/types/calendar-time";
import { onDutyIds, type TaskRef } from "@/features/tasks/types/tasks";
import type { Locale } from "@/types/common";
import { addDays, daysBetween } from "@/types/dates";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { isTimeDue } from "../notifications/notification-policy";
import { formatDay, formatMoney, listOf } from "../notifications/notification-text";
import { notify, notifyInBackground } from "../notifications/notify";
import { recipientsWithTime, registerScheduledNotifier } from "../notifications/scheduled-notifiers";

/*
 * Task notifications (docs/NOTIFICATIONS.md):
 * - tasks.assigned   someone assigned a task to you (not when you did it yourself);
 * - tasks.digest     a morning overview of what is overdue and due today for you (one message, not one per task);
 * - tasks.unblocked  a task that waited for another one can start now;
 * - tasks.payments   "Pay tomorrow: Watergroep · € 52,30" and overdue pay tasks (to the payer, else the adults).
 */

export const TASKS_ASSIGNED_KIND = "tasks.assigned";
export const TASKS_DIGEST_KIND = "tasks.digest";
export const TASKS_UNBLOCKED_KIND = "tasks.unblocked";
export const TASKS_PAYMENTS_KIND = "tasks.payments";

registerNotificationKind({
  id: TASKS_DIGEST_KIND,
  group: "tasks",
  titleKey: "tasks:notifications.digest.title",
  descriptionKey: "tasks:notifications.digest.description",
  times: ["07:00", "07:30", "08:00", "08:30", "09:00"],
  defaultTime: "08:00",
  priority: "high",
});
registerNotificationKind({
  id: TASKS_ASSIGNED_KIND,
  group: "tasks",
  titleKey: "tasks:notifications.assigned.title",
  descriptionKey: "tasks:notifications.assigned.description",
  priority: "high",
});
registerNotificationKind({
  id: TASKS_UNBLOCKED_KIND,
  group: "tasks",
  titleKey: "tasks:notifications.unblocked.title",
  descriptionKey: "tasks:notifications.unblocked.description",
  priority: "high",
});
registerNotificationKind({
  id: TASKS_PAYMENTS_KIND,
  group: "money",
  priority: "high",
  titleKey: "tasks:notifications.payments.title",
  descriptionKey: "tasks:notifications.payments.description",
  times: ["08:00", "09:00", "12:00", "18:00", "20:00"],
  defaultTime: "09:00",
  roles: ["owner", "adult"],
});

const taskUrl = (id: string) => `/tasks/${encodeURIComponent(id)}`;
const ADULTS: SessionUser["role"][] = ["owner", "adult"];

// ── Assigned ─────────────────────────────────────────────────────────────────────────────────────────

/** The assignees a task has now (to compare after an edit). */
export async function currentAssigneeIds(householdId: string, taskId: string): Promise<string[]> {
  const rows = await db.taskAssignee.findMany({ where: { taskId, task: { householdId } }, select: { habitantId: true } });
  return rows.map((row) => row.habitantId);
}

/** Tells newly assigned people (not the one who did it). Fire and forget. */
export function notifyAssigned(actor: SessionUser, task: { id: string; title: string; dueDate: string | null; assigneeIds: string[] }, before: string[] = []): void {
  const added = task.assigneeIds.filter((id) => !before.includes(id));
  if (added.length === 0) return;
  notifyInBackground({
    householdId: actor.householdId,
    kind: TASKS_ASSIGNED_KIND,
    habitantIds: added,
    excludeUserIds: [actor.id],
    url: taskUrl(task.id),
    tag: `tasks:assigned:${task.id}`,
    dedupeMinutes: 10,
    content: (locale) => {
      const due = task.dueDate ? formatDay(task.dueDate, locale) : null;
      return locale === "nl"
        ? { title: `Aan jou toegewezen: ${task.title}`, body: [`Door ${actor.name}`, due && `tegen ${due}`].filter(Boolean).join(" · ") }
        : { title: `Assigned to you: ${task.title}`, body: [`By ${actor.name}`, due && `due ${due}`].filter(Boolean).join(" · ") };
    },
  });
}

// ── Unblocked ────────────────────────────────────────────────────────────────────────────────────────

/** "Can start now: Load the dishwasher" to the assignees of each unblocked task (else the adults). Fire and forget. */
export function notifyUnblocked(householdId: string, blockerTitle: string, unblocked: TaskRef[], actorUserId: string | null): void {
  if (unblocked.length === 0) return;
  void (async () => {
    for (const task of unblocked) {
      const habitantIds = (await db.taskAssignee.findMany({ where: { taskId: task.id }, select: { habitantId: true } })).map((row) => row.habitantId);
      await notify({
        householdId,
        kind: TASKS_UNBLOCKED_KIND,
        // Its people; nobody assigned: the adults.
        ...(habitantIds.length > 0 ? { habitantIds } : { roles: ADULTS }),
        excludeUserIds: actorUserId ? [actorUserId] : [],
        url: taskUrl(task.id),
        tag: `tasks:unblocked:${task.id}`,
        dedupeMinutes: 60,
        content: (locale) =>
          locale === "nl"
            ? { title: `Kan nu beginnen: ${task.title}`, body: `“${blockerTitle}” is klaar.` }
            : { title: `Can start now: ${task.title}`, body: `“${blockerTitle}” is done.` },
      });
    }
  })().catch((error: unknown) => console.error("[notifications] tasks.unblocked failed", error));
}

// ── Morning digest ───────────────────────────────────────────────────────────────────────────────────

export type DigestTask = { id: string; title: string; dueDate: string | null; assigneeIds: string[]; rotateAssignees: boolean };

export type TaskDigest = { title: string; body: string; count: number; overdue: number; url: string };

/**
 * The morning digest for one person (pure): their open tasks overdue or due today (on duty for their habitant),
 * plus unassigned ones due today or overdue, in one message. Null when there is nothing.
 */
export function buildTaskDigest({ tasks, habitantId, today, locale }: { tasks: DigestTask[]; habitantId: string | null; today: string; locale: Locale }): TaskDigest | null {
  const due = tasks.filter((task) => task.dueDate !== null && task.dueDate <= today);
  const mine = habitantId ? due.filter((task) => onDutyIds(task).includes(habitantId)) : [];
  const open = due.filter((task) => task.assigneeIds.length === 0);
  const relevant = [...mine, ...open];
  if (relevant.length === 0) return null;
  const sorted = relevant.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.title.localeCompare(b.title));
  const overdue = sorted.filter((task) => (task.dueDate ?? today) < today);
  const todayTasks = sorted.filter((task) => task.dueDate === today);
  const titles = (list: DigestTask[]) => listOf(list.map((task) => task.title), locale, 3);
  const nl = locale === "nl";
  const parts = [
    overdue.length > 0 && `${nl ? "Te laat" : "Overdue"}: ${titles(overdue)}`,
    todayTasks.length > 0 && `${nl ? "Vandaag" : "Today"}: ${titles(todayTasks)}`,
  ].filter(Boolean);
  const count = sorted.length;
  const title = nl
    ? `Vandaag: ${count} ${count === 1 ? "taak" : "taken"}${overdue.length > 0 ? ` (${overdue.length} te laat)` : ""}`
    : `Today: ${count} ${count === 1 ? "task" : "tasks"}${overdue.length > 0 ? ` (${overdue.length} overdue)` : ""}`;
  return { title, body: parts.join(" · "), count, overdue: overdue.length, url: "/tasks" };
}

async function sendDigests(householdId: string, now: Date): Promise<number> {
  const today = zonedParts(now).date;
  const recipients = (await recipientsWithTime({ householdId }, TASKS_DIGEST_KIND)).filter((recipient) => recipient.time && isTimeDue(recipient.time, now));
  if (recipients.length === 0) return 0;
  const rows = await db.task.findMany({
    where: { householdId, status: "OPEN", dueDate: { lte: new Date(`${today}T00:00:00Z`) } },
    select: { id: true, title: true, dueDate: true, rotateAssignees: true, assignees: { orderBy: { position: "asc" }, select: { habitantId: true } } },
  });
  const tasks: DigestTask[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
    rotateAssignees: row.rotateAssignees,
    assigneeIds: row.assignees.map((assignee) => assignee.habitantId),
  }));
  const habitants = new Map(
    (await db.user.findMany({ where: { id: { in: recipients.map((recipient) => recipient.userId) } }, select: { id: true, habitantId: true } })).map((user) => [
      user.id,
      user.habitantId,
    ]),
  );
  let stored = 0;
  for (const recipient of recipients) {
    const habitantId = habitants.get(recipient.userId) ?? null;
    const digest = buildTaskDigest({ tasks, habitantId, today, locale: recipient.locale });
    if (!digest) continue;
    const result = await notify({
      householdId,
      kind: TASKS_DIGEST_KIND,
      userIds: [recipient.userId],
      tag: `tasks:digest:${today}`,
      dedupeMinutes: 20 * 60,
      url: digest.url,
      data: { count: digest.count, overdue: digest.overdue },
      content: (locale) => {
        const text = buildTaskDigest({ tasks, habitantId, today, locale }) ?? digest;
        return { title: text.title, body: text.body };
      },
    });
    stored += result.stored;
  }
  return stored;
}

// ── Payments ─────────────────────────────────────────────────────────────────────────────────────────

/** Overdue pay tasks are recalled every few days, for two weeks at most. */
const OVERDUE_REMIND_DAYS = 14;
const OVERDUE_EVERY_MINUTES = 3 * 24 * 60 - 60;

async function sendPaymentReminders(householdId: string, now: Date): Promise<number> {
  const today = zonedParts(now).date;
  const tasks = await db.task.findMany({
    where: {
      householdId,
      originType: "expense",
      status: "OPEN",
      dueDate: { gte: new Date(`${addDays(today, -OVERDUE_REMIND_DAYS)}T00:00:00Z`), lte: new Date(`${addDays(today, 1)}T00:00:00Z`) },
    },
    select: { id: true, originId: true, dueDate: true, heldAt: true, assignees: { select: { habitantId: true } } },
  });
  let stored = 0;
  for (const task of tasks) {
    const dueDate = task.dueDate?.toISOString().slice(0, 10);
    // Due today is the "pay tomorrow" heads-up that went out yesterday; on hold means someone is on it.
    if (!dueDate || !task.originId || task.heldAt || dueDate === today) continue;
    const overdue = dueDate < today;
    const expense = await db.expense.findFirst({ where: { id: task.originId, householdId }, select: { payee: true, amountCents: true, dueDate: true } });
    if (!expense) continue;
    const habitantIds = task.assignees.map((assignee) => assignee.habitantId);
    const recipients = (await recipientsWithTime({ householdId, habitantIds, fallbackToHousehold: true, roles: ["owner", "adult"] }, TASKS_PAYMENTS_KIND)).filter(
      (recipient) => recipient.time && isTimeDue(recipient.time, now),
    );
    if (recipients.length === 0) continue;
    const expenseDue = expense.dueDate.toISOString().slice(0, 10);
    const result = await notify({
      householdId,
      kind: TASKS_PAYMENTS_KIND,
      userIds: recipients.map((recipient) => recipient.userId),
      tag: `pay:${task.originId}:${overdue ? "overdue" : "soon"}`,
      dedupeMinutes: overdue ? OVERDUE_EVERY_MINUTES : 36 * 60,
      url: `/expenses/${encodeURIComponent(task.originId)}`,
      data: { expenseId: task.originId, overdue },
      content: (locale) => {
        const what = `${expense.payee} · ${formatMoney(expense.amountCents, locale)}`;
        const late = daysBetween(dueDate, today);
        if (locale === "nl") {
          return overdue
            ? { title: `Nog te betalen: ${what}`, body: `Moest betaald voor ${formatDay(expenseDue, "nl")} (${late} ${late === 1 ? "dag" : "dagen"} te laat).` }
            : { title: `Morgen betalen: ${what}`, body: `Vervalt op ${formatDay(expenseDue, "nl")}.` };
        }
        return overdue
          ? { title: `Still to pay: ${what}`, body: `Was to be paid before ${formatDay(expenseDue, "en")} (${late} ${late === 1 ? "day" : "days"} late).` }
          : { title: `Pay tomorrow: ${what}`, body: `Due on ${formatDay(expenseDue, "en")}.` };
      },
    });
    stored += result.stored;
  }
  return stored;
}

const eachHousehold = async (signal: AbortSignal, run: (householdId: string) => Promise<number>) => {
  let stored = 0;
  for (const { id } of await db.household.findMany({ select: { id: true } })) {
    if (signal.aborted) break;
    stored += await run(id);
  }
  return stored;
};

registerScheduledNotifier({ id: TASKS_DIGEST_KIND, run: ({ now, signal }) => eachHousehold(signal, (id) => sendDigests(id, now)) });
registerScheduledNotifier({ id: TASKS_PAYMENTS_KIND, run: ({ now, signal }) => eachHousehold(signal, (id) => sendPaymentReminders(id, now)) });
