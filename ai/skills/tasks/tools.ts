import { z } from "zod";
import { todayProgress } from "@/features/tasks/types/task-views";
import {
  TASK_TYPES,
  dueState,
  onDutyIds,
  taskCompleteInputSchema,
  taskInputSchema,
  taskReminderMoment,
  taskWhenKind,
  type Task,
} from "@/features/tasks/types/tasks";
import { zonedParts } from "@/features/calendar/types/calendar-time";
import { badRequest } from "@/api/lib/http";
import { createItem, listItems } from "@/api/shopping/shopping.service";
import { addTaskComment } from "@/api/tasks/task-comments";
import { addTaskLink, removeTaskLink } from "@/api/tasks/task-links";
import { notifyAssigned } from "@/api/tasks/task-notifications";
import {
  completeTask,
  createTask,
  deleteTask,
  getTaskDetail,
  getTasksOverview,
  holdTask,
  releaseTask,
  reopenTask,
  skipTask,
  snoozeTask,
  toggleChecklistItem,
  updateTask,
} from "@/api/tasks/tasks.service";
import {
  capList,
  day,
  done,
  entityNames,
  entityRef,
  optionalDateSchema,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  timeSchema,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";
import { fold } from "@ai/core/text-match";
import { todayIn } from "@/types/dates";
import {
  REPEAT_CHOICES,
  WEEKDAY_ARGS,
  firstWeekdayDate,
  mergeTaskInput,
  openFirst,
  reminderMinutesOf,
  repeatRule,
  weekdayCodes,
  type WeekdayArg,
} from "./task-input";

/** Skill "tasks": household to-dos and chores (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "tasks",
  title: { en: "Tasks", nl: "Taken" },
  summary: "Household to-dos and chores: open/overdue/done, add, edit, complete, hold, dependencies, comments, checklists, materials, times, timeslots, several days, reminders.",
  keywords: {
    nl: ["taak", "taken", "todo", "klus", "klusje", "afvinken", "gedaan", "te doen", "moet ik", "huishoudtaak", "opruimen", "poetsen", "herinner", "herinnering", "niet vergeten", "gemaaid", "gepoetst", "afgewerkt",
      "on hold", "wacht op", "uitstellen", "overslaan", "heropen", "commentaar", "checklist", "materiaal", "alles gedaan", "achterstallig"],
    en: ["task", "todo", "to-do", "chore", "done", "tick off", "to do", "overdue", "on duty", "remind me", "reminder", "don't forget", "mark it done",
      "on hold", "waiting for", "postpone", "snooze", "skip", "reopen", "comment", "checklist", "materials", "all done"],
  },
});

const LIST_LIMIT = 20;
const LINKED: Record<string, string> = { expense: "payment", waste: "waste collection", vouchers: "meal vouchers" };

/** "at 21:00" / "30 min before 21:00" / all day "2026-10-11 09:00" (sent: "… (sent)"), or `null` without one. */
function reminderText(task: Pick<Task, "dueDate" | "dueTime" | "endTime" | "startDate" | "reminderMinutes" | "remindedAt">): string | null {
  const moment = taskReminderMoment(task);
  if (!moment || task.reminderMinutes === null) return null;
  const kind = taskWhenKind(task);
  const timed = kind === "moment" || kind === "slot";
  const when = !timed ? `${moment.date} ${moment.time}` : task.reminderMinutes === 0 ? `at ${task.dueTime}` : `${task.reminderMinutes} min before ${task.dueTime}`;
  return task.remindedAt ? `${when} (sent)` : when;
}

/** A task's "when" for the model: "2026-10-11 18:00", "2026-10-10 10:00-12:00", "2026-10-12 to 2026-10-14", or `null`. */
function dueText(task: Pick<Task, "dueDate" | "dueTime" | "endTime" | "startDate">): string | null {
  if (!task.dueDate) return null;
  switch (taskWhenKind(task)) {
    case "days":
      return `${task.startDate} to ${task.dueDate}`;
    case "slot":
      return `${task.dueDate} ${task.dueTime}-${task.endTime}`;
    case "moment":
      return `${task.dueDate} ${task.dueTime}`;
    default:
      return task.dueDate;
  }
}

/** "zo 11/10/2026 18:00–19:00" / "ma 12/10/2026 – wo 14/10/2026" for confirmations and answers. */
function whenText(locale: "en" | "nl", when: { date?: string; time?: string; endTime?: string; endDate?: string }): string | null {
  if (!when.date) return null;
  const first = day(when.date, locale, true) ?? when.date;
  if (when.endDate && when.endDate > when.date) return `${first} – ${day(when.endDate, locale, true) ?? when.endDate}`;
  if (when.time && when.endTime) return `${first} ${when.time}–${when.endTime}`;
  return when.time ? `${first} ${when.time}` : first;
}

/** "at 21:00" / "10:00–12:00, reminder 15 min before" for the confirmation and the answer. */
function timeText(locale: "en" | "nl", time: string | undefined, remind: boolean | number | undefined, end?: string): string | null {
  if (!time) return null;
  const at = end ? `${time}–${end}` : say(locale, `at ${time}`, `om ${time}`);
  const minutes = reminderMinutesOf(remind);
  if (minutes === undefined || minutes === null) return at;
  return minutes === 0
    ? say(locale, `${at}, with a reminder`, `${at}, met herinnering`)
    : say(locale, `${at}, reminder ${minutes} min before`, `${at}, herinnering ${minutes} min vooraf`);
}

/** The (first) day of a new task: the date said; a time alone: today; weekdays alone: the first such day. */
function addDate(input: { dueDate?: string; time?: string; weekdays?: WeekdayArg[] }): string | undefined {
  return input.dueDate ?? firstWeekdayDate(weekdayCodes(input.weekdays), todayIn(), input.time, nowTime()) ?? (input.time ? todayIn() : undefined);
}

/** "sun" / "mon, thu" for confirmations. */
const weekdayList = (days: WeekdayArg[] | undefined) => (days?.length ? days.join(", ") : null);

/** "FREQ=WEEKLY;BYDAY=SU" → "weekly on SU" for answers (the model says it in words). */
function repeatSummary(rrule: string): string {
  const days = /BYDAY=([A-Z,]+)/.exec(rrule)?.[1];
  const freq = /FREQ=([A-Z]+)/.exec(rrule)?.[1]?.toLowerCase() ?? "custom";
  const every2 = /INTERVAL=2/.test(rrule) ? "every 2 weeks" : freq;
  return days ? `${every2} on ${days}` : every2;
}

/** "due Sun 11/10/2026 18:00" / "Sat 10/10/2026 10:00–12:00" / "Mon 12/10/2026 – Wed 14/10/2026" in answers. */
function answerWhen(task: Task): string {
  const date = task.startDate && task.dueDate && task.startDate < task.dueDate ? task.startDate : (task.dueDate ?? "");
  const when = whenText("en", {
    date,
    time: task.dueTime ?? undefined,
    endTime: task.endTime ?? undefined,
    endDate: date !== task.dueDate ? (task.dueDate ?? undefined) : undefined,
  });
  return `due ${when ?? date}`;
}

const compact = (task: Task, names: Map<string, string>, today: string) => ({
  id: task.id,
  title: task.title,
  due: dueText(task),
  state: task.status === "open" ? dueState(task, today) : task.status,
  who: onDutyIds(task).map((id) => names.get(id) ?? "?"),
  assignment: onDutyIds(task).length ? "assigned" : "unassigned",
  priority: task.priority === "normal" ? null : task.priority,
  place: task.place?.name,
  recurring: task.rrule ? true : null,
  reminder: reminderText(task),
  onHold: task.hold ? (task.hold.reason ?? true) : null,
  waitingFor: task.waitingFor.length ? task.waitingFor.map((other) => other.title) : null,
  materials: task.materials && task.readiness === "waiting" ? `${task.materials.bought}/${task.materials.total} bought` : null,
  linked: task.origin ? (LINKED[task.origin.type] ?? task.origin.type) : null,
});

registerEntityResolver({
  type: "task",
  label: "task",
  skill: "tasks",
  // Open tasks, plus recently closed ones no open task shares a title with (to reopen them).
  list: async (ctx) => {
    const overview = await getTasksOverview(ctx.user);
    const open = overview.tasks.filter((task) => task.status === "open");
    const closed = overview.tasks.filter((task) => task.status !== "open");
    return openFirst(open, closed, (task) => task.title).map((task) => ({
      id: task.id,
      name: task.title,
      date: task.dueDate,
      hint: task.status !== "open" ? task.status : task.dueDate ? (day(task.dueDate, ctx.locale) ?? undefined) : undefined,
      data: { status: task.status, origin: task.origin?.type ?? null },
    }));
  },
});

const isPayment = (task: ResolvedEntity) => task.data?.origin === "expense";

const personList = (people?: ResolvedEntity[]) => (people?.length ? people.map((person) => person.name).join(", ") : null);

/** Shopping items for a task's materials, as the task's materials panel adds them. */
async function addMaterials(ctx: AssistantToolContext, taskId: string, names: string[] | undefined) {
  for (const name of names ?? []) await createItem(ctx.user, { name, source: "task", taskId });
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "tasks.list_open",
  description:
    "Task names, due dates and assignees. For tonight use today (includes all-day tasks and overdue). items/matchingCount obey the filters; summaryScope and todayRemaining are household-wide. mine/person exclude unassigned tasks, so a personal list can be empty while household tasks remain. Names are in todayRemaining.items; report them as unassigned when appropriate.",
  input: z.object({
    filter: z
      .enum(["all", "mine", "today", "overdue", "ready", "waiting", "on_hold", "done"])
      .default("all")
      .describe("today = tasks due today or overdue, including unassigned tasks (use for tonight); mine = only tasks assigned to you; waiting = materials to buy; done = last 30 days"),
    person: entityRef("habitant").optional(),
    place: entityRef("place").optional(),
    type: z.enum(TASK_TYPES).optional(),
  }),
  permission: "read",
  confirm: "never",
  core: true,
  activity: { en: "Checked the tasks", nl: "Taken bekeken" },
  run: async (ctx, input) => {
    const [overview, names] = await Promise.all([getTasksOverview(ctx.user), entityNames(ctx, "habitant")]);
    const today = overview.today;
    const open = overview.tasks.filter((task) => task.status === "open");
    const pool = input.filter === "done" ? overview.tasks.filter((task) => task.status !== "open") : open;
    const filtered = pool.filter((task) => {
      const state = dueState(task, today);
      if (input.filter === "overdue" && state !== "overdue") return false;
      if (input.filter === "today" && state !== "overdue" && state !== "today") return false;
      if (input.filter === "mine" && !onDutyIds(task).includes(ctx.user.habitantId ?? "")) return false;
      if (input.filter === "ready" && (task.readiness !== "ready" || task.hold || task.waitingFor.length)) return false;
      if (input.filter === "waiting" && task.readiness !== "waiting") return false;
      if (input.filter === "on_hold" && !task.hold) return false;
      if (input.person && !onDutyIds(task).includes(input.person.id)) return false;
      if (input.place && task.place?.id !== input.place.id) return false;
      if (input.type && task.type !== input.type) return false;
      return true;
    });
    if (input.filter === "done") filtered.sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
    const progress = todayProgress(open, overview.completedToday, today);
    const remainingToday = open.filter((task) => {
      const state = dueState(task, today);
      return state === "overdue" || state === "today";
    });
    return {
      summaryScope: "household",
      open: open.length,
      overdue: open.filter((task) => dueState(task, today) === "overdue").length,
      today: `${progress.done} of ${progress.total} done`,
      allDoneToday: progress.allDoneToday || null,
      allDone: progress.allDone || null,
      todayRemaining: {
        count: remainingToday.length,
        ...capList(remainingToday, LIST_LIMIT, (task) => ({
          id: task.id,
          title: task.title,
          due: dueText(task),
          who: onDutyIds(task).map((id) => names.get(id) ?? "?"),
          assignment: onDutyIds(task).length ? "assigned" : "unassigned",
        })),
      },
      filters: { filter: input.filter, person: input.person?.name ?? (input.filter === "mine" ? ctx.user.name : null), place: input.place?.name ?? null, type: input.type ?? null },
      matchingCount: filtered.length,
      note: input.filter === "mine" && !ctx.user.habitantId
        ? "This account is not linked to a household member. The personal list is empty; todayRemaining lists the household's remaining tasks."
        : input.filter !== "done" && filtered.length === 0 && remainingToday.length > 0
          ? "No tasks match these filters. Today's household tasks are listed by title in todayRemaining; they may be unassigned or assigned to someone else."
          : null,
      ...capList(filtered, LIST_LIMIT, (task) => compact(task, names, today)),
    };
  },
});

registerAssistantTool({
  name: "tasks.details",
  description: "One task in full: notes, checklist, repeat and next dates, history, what it waits for / blocks / is related to, comments, materials, linked origin.",
  input: z.object({ task: entityRef("task") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at a task", nl: "Taak bekeken" },
  run: async (ctx, input) => {
    const [detail, names, materials] = await Promise.all([
      getTaskDetail(ctx.user, input.task.id),
      entityNames(ctx, "habitant"),
      listItems(ctx.householdId, { taskId: input.task.id }),
    ]);
    const { task } = detail;
    const ref = (other: { title: string; status: string }) => (other.status === "open" ? other.title : `${other.title} (${other.status})`);
    const refs = (list: { title: string; status: string }[]) => (list.length ? list.map(ref) : null);
    return {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      state: task.status === "open" ? dueState(task, detail.today) : null,
      due: dueText(task),
      reminder: reminderText(task),
      who: task.assigneeIds.map((id) => names.get(id) ?? "?"),
      rotates: task.rotateAssignees || null,
      priority: task.priority,
      place: task.place?.name,
      project: task.project?.name,
      estimateMinutes: task.estimatedMinutes,
      notes: task.notes,
      onHold: task.hold ? `since ${day(task.hold.since)}${task.hold.reason ? `: ${task.hold.reason}` : ""}` : null,
      checklist: task.checklist.length ? task.checklist.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.label}`) : null,
      repeats: task.rrule,
      nextDates: detail.upcoming.length ? detail.upcoming : null,
      waitsFor: refs(detail.links.blockedBy),
      blocks: refs(detail.links.blocks),
      related: refs(detail.links.related),
      materials: materials.length ? materials.map((item) => `${item.name}${item.quantity !== 1 ? ` ×${item.quantity}` : ""}${item.status === "bought" ? " (bought)" : ""}`) : null,
      linked: task.origin
        ? `${LINKED[task.origin.type] ?? task.origin.type}${task.origin.date ? ` ${task.origin.date}` : ""}${task.origin.type === "expense" ? "; completing it marks the payment paid" : ""}; only assignees and notes can change`
        : null,
      history: capList(detail.history, 5, (entry) => `${day(entry.completedAt)} ${entry.outcome}${entry.completedById ? ` by ${names.get(entry.completedById) ?? "?"}` : ""}${entry.note ? `: ${entry.note}` : ""}`).items,
      comments: detail.comments.length
        ? detail.comments.slice(-8).map((comment) => `${comment.authorName ?? "?"} ${day(comment.createdAt)}: ${comment.body.slice(0, 200)}`)
        : null,
    };
  },
});

// ── Writes ────────────────────────────────────────────────────────────────────────────────────────────

const people = () => z.array(entityRef("habitant", "First name or 'me'")).max(10).optional();
const repeat = () => z.enum(REPEAT_CHOICES).optional().describe("From the due date; none = stop");
const weekdays = () =>
  z.array(z.enum(WEEKDAY_ARGS)).min(1).max(7).optional().describe("weekly/biweekly on these days, e.g. ['sun'] for 'elke zondag'");
const time = () => timeSchema("HH:MM 24-hour, e.g. 21:00 (9pm, 'om 21u'); start of a timeslot").optional();
const endTime = () => timeSchema("End of a timeslot HH:MM, e.g. 12:00 for 'van 10 tot 12'").optional();
const endDate = () => optionalDateSchema("Last day YYYY-MM-DD when it spans several days (all day)");
const remind = () =>
  z
    .union([z.boolean(), z.number().int().min(0).max(10_080)])
    .optional()
    .describe("Push reminder: true = at the (start) time, a number = minutes before; all day: 09:00");

/** "now" on the household clock, `HH:MM`. */
const nowTime = () => zonedParts(new Date()).time;

registerAssistantTool({
  name: "tasks.add",
  description:
    "Add a task (to-do or recurring chore), optionally with a day, time or timeslot (time + endTime), several days (dueDate + endDate), a push reminder, people, room, repeat (weekdays), checklist, materials and a task it waits for. 'Remind me at 21:00 to …' = time + remind (today when no date).",
  input: z.object({
    title: z.string().trim().min(1).max(120),
    dueDate: optionalDateSchema("YYYY-MM-DD, the (first) day; with a time and no date: today"),
    time: time(),
    endTime: endTime(),
    endDate: endDate(),
    remind: remind(),
    assignees: people(),
    place: entityRef("place").optional(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    notes: z.string().max(500).optional(),
    repeat: repeat(),
    weekdays: weekdays(),
    checklist: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    materials: z.array(z.string().trim().min(1).max(120)).max(20).optional().describe("Things to buy for it"),
    waitsFor: entityRef("task", "Task that must be done first").optional(),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Added a task", nl: "Taak toegevoegd" },
  describe: (ctx, input) => {
    const who = personList(input.assignees);
    const date = addDate(input);
    const days = weekdayList(input.weekdays);
    const parts = [
      who && `(${who})`,
      date && !input.time && say(ctx.locale, whenText("en", { date, endDate: input.endDate }) ?? "", whenText("nl", { date, endDate: input.endDate }) ?? ""),
      date && input.time && say(ctx.locale, `on ${day(date, "en", true)}`, `op ${day(date, "nl", true)}`),
      timeText(ctx.locale, input.time, input.remind, input.endTime),
      !input.time && input.remind !== undefined && input.remind !== false && say(ctx.locale, "with a reminder", "met herinnering"),
      input.repeat && input.repeat !== "none" && say(ctx.locale, `repeats ${input.repeat}${days ? ` on ${days}` : ""}`, `herhaalt ${input.repeat}${days ? ` op ${days}` : ""}`),
      input.materials?.length && say(ctx.locale, `materials: ${input.materials.join(", ")}`, `materiaal: ${input.materials.join(", ")}`),
      input.waitsFor && say(ctx.locale, `after “${input.waitsFor.name}”`, `na “${input.waitsFor.name}”`),
    ].filter(Boolean);
    return say(ctx.locale, `Add the task “${input.title}” ${parts.join(", ")}`, `Taak “${input.title}” toevoegen ${parts.join(", ")}`).trim();
  },
  run: async (ctx, input) => {
    if (input.remind !== undefined && input.remind !== false && !input.time && !input.dueDate && !input.weekdays) {
      throw badRequest("A reminder needs a time (HH:MM) or a day");
    }
    if (input.endTime && !input.time) throw badRequest("A timeslot needs its start: time (HH:MM) and endTime");
    const multiDay = Boolean(input.endDate && input.dueDate && input.endDate > input.dueDate);
    if (multiDay && input.time) throw badRequest("Several days are all day: leave out time, or use one day with a time");
    const days = weekdayCodes(input.weekdays);
    const repeatChoice = input.repeat ?? (days ? "weekly" : undefined);
    const dueDate = addDate(input);
    const rrule = repeatRule(repeatChoice, dueDate, null, days) ?? null;
    if (repeatChoice && repeatChoice !== "none" && !dueDate) throw badRequest("A repeating task needs a due date (the first time) or weekdays");
    const task = await createTask(
      ctx.householdId,
      taskInputSchema.parse({
        title: input.title,
        type: rrule ? "chore" : "todo",
        // Several days: from dueDate (first) to endDate (last, the day it is due).
        dueDate: multiDay ? input.endDate : (dueDate ?? null),
        startDate: multiDay ? dueDate : null,
        dueTime: input.time ?? null,
        endTime: input.time ? (input.endTime ?? null) : null,
        reminderMinutes: reminderMinutesOf(input.remind) ?? null,
        assigneeIds: (input.assignees ?? []).map((person) => person.id),
        placeId: input.place?.id ?? null,
        priority: input.priority,
        notes: input.notes ?? null,
        rrule,
        checklist: (input.checklist ?? []).map((label) => ({ label, done: false })),
      }),
      { createdById: ctx.user.id },
    );
    notifyAssigned(ctx.user, task);
    await addMaterials(ctx, task.id, input.materials);
    if (input.waitsFor) await addTaskLink(ctx.user, task.id, { otherTaskId: input.waitsFor.id, kind: "blocked_by" });
    const who = personList(input.assignees);
    const reminder = reminderText(task);
    const repeats = task.rrule ? ` (${repeatSummary(task.rrule)})` : "";
    return done(`Added “${task.title}”${task.dueDate ? `, ${answerWhen(task)}` : ""}${repeats}${who ? ` for ${who}` : ""}${reminder ? `; push reminder ${reminder}` : ""}.`, { id: task.id });
  },
});

registerAssistantTool({
  name: "tasks.update",
  description:
    "Change a task; only what is given changes. assignees replaces the people ([] = nobody); rotate = take turns; time/endTime = time or timeslot; endDate = several days; remind false = no reminder.",
  input: z.object({
    task: entityRef("task"),
    title: z.string().trim().min(1).max(120).optional(),
    dueDate: optionalDateSchema("YYYY-MM-DD, the (first) day; several days keep their length"),
    noDueDate: z.boolean().optional(),
    time: time(),
    endTime: endTime(),
    endDate: endDate(),
    noTime: z.boolean().optional().describe("Remove the time and timeslot"),
    remind: remind(),
    assignees: people(),
    place: entityRef("place").optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    type: z.enum(TASK_TYPES).optional(),
    notes: z.string().max(2000).optional(),
    repeat: repeat(),
    weekdays: weekdays(),
    repeatUntil: optionalDateSchema("YYYY-MM-DD"),
    rotate: z.boolean().optional(),
    estimateMinutes: z.number().int().min(1).max(10_080).optional(),
    addChecklist: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    addMaterials: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed a task", nl: "Taak aangepast" },
  describe: (ctx, input) => {
    const changes = [
      input.title && `“${input.title}”`,
      input.dueDate && say(ctx.locale, `on ${whenText("en", { date: input.dueDate, endDate: input.endDate })}`, `op ${whenText("nl", { date: input.dueDate, endDate: input.endDate })}`),
      !input.dueDate && input.endDate && say(ctx.locale, `until ${day(input.endDate, "en", true)}`, `tot ${day(input.endDate, "nl", true)}`),
      input.noDueDate && say(ctx.locale, "no due date", "geen datum"),
      timeText(ctx.locale, input.time, input.remind, input.endTime),
      !input.time && input.endTime && say(ctx.locale, `until ${input.endTime}`, `tot ${input.endTime}`),
      input.noTime && say(ctx.locale, "no time", "geen uur"),
      !input.time && input.remind !== undefined &&
        (input.remind === false ? say(ctx.locale, "no reminder", "geen herinnering") : say(ctx.locale, "with a reminder", "met herinnering")),
      input.assignees && (personList(input.assignees) ?? say(ctx.locale, "nobody", "niemand")),
      input.place?.name,
      input.priority,
      input.repeat && say(ctx.locale, `repeat: ${input.repeat}`, `herhaling: ${input.repeat}`),
      input.weekdays?.length && say(ctx.locale, `on ${weekdayList(input.weekdays)}`, `op ${weekdayList(input.weekdays)}`),
      input.notes !== undefined && say(ctx.locale, "notes", "notities"),
      input.addChecklist?.length && say(ctx.locale, `+${input.addChecklist.length} checklist`, `+${input.addChecklist.length} checklist`),
      input.addMaterials?.length && say(ctx.locale, `materials: ${input.addMaterials.join(", ")}`, `materiaal: ${input.addMaterials.join(", ")}`),
    ].filter(Boolean);
    return say(ctx.locale, `Change “${input.task.name}”: ${changes.join(", ")}`, `“${input.task.name}” aanpassen: ${changes.join(", ")}`);
  },
  run: async (ctx, input) => {
    const { task } = await getTaskDetail(ctx.user, input.task.id);
    const onlyLinkedFields = Object.entries(input).every(([key, value]) => value === undefined || ["task", "assignees", "notes", "addMaterials"].includes(key));
    if (task.origin && !onlyLinkedFields) throw badRequest("A linked task only takes people and notes; the rest follows where it comes from");
    // A time on a task without a date: today.
    const dueDate = input.noDueDate ? null : (input.dueDate ?? (input.time && !task.dueDate ? todayIn() : undefined));
    const hasDate = dueDate === undefined ? Boolean(task.dueDate) : Boolean(dueDate);
    if (input.remind !== undefined && input.remind !== false && !hasDate) {
      throw badRequest("A reminder needs a day or a time");
    }
    const merged = mergeTaskInput(task, {
      title: input.title,
      dueDate,
      endDate: input.endDate,
      dueTime: input.noTime ? null : input.time,
      endTime: input.noTime ? null : input.endTime,
      weekdays: weekdayCodes(input.weekdays),
      remind: input.remind,
      assigneeIds: input.assignees?.map((person) => person.id),
      placeId: input.place?.id,
      priority: input.priority,
      type: input.type,
      notes: input.notes,
      estimatedMinutes: input.estimateMinutes,
      repeat: input.repeat,
      repeatUntil: input.repeatUntil,
      rotate: input.rotate,
      addChecklist: input.addChecklist,
    });
    const updated = await updateTask(ctx.householdId, task.id, merged);
    notifyAssigned(ctx.user, updated, task.assigneeIds);
    await addMaterials(ctx, task.id, input.addMaterials);
    const reminder = reminderText(updated);
    const repeats = updated.rrule ? ` (${repeatSummary(updated.rrule)})` : "";
    return done(`Changed “${updated.title}”${updated.dueDate ? `, ${answerWhen(updated)}` : ""}${repeats}${reminder ? `; push reminder ${reminder}` : ""}.`, {
      id: updated.id,
    });
  },
});

registerAssistantTool({
  name: "tasks.complete",
  description: "Mark an open task as done (a recurring task: this time only). Completing a payment task marks the payment paid.",
  input: z.object({
    task: entityRef("task"),
    note: z.string().max(300).optional(),
    doneBy: entityRef("habitant", "Who did it, when it was someone else than the person asking").optional(),
    force: z.boolean().optional().describe("Complete anyway although it still waits for another task (only when the person says so)"),
  }),
  permission: "write",
  confirm: "first-time",
  // Children may complete tasks assigned to them; the service checks it (and records them as the doer).
  roles: ["owner", "adult", "child"],
  activity: { en: "Marked a task done", nl: "Taak afgevinkt" },
  describe: (ctx, input) => {
    const paid = isPayment(input.task) ? say(ctx.locale, " (the payment is marked paid)", " (de betaling wordt als betaald aangeduid)") : "";
    const by = input.doneBy ? say(ctx.locale, ` by ${input.doneBy.name}`, ` door ${input.doneBy.name}`) : "";
    return say(ctx.locale, `Mark “${input.task.name}” as done${by}${paid}`, `“${input.task.name}” als gedaan aanduiden${by}${paid}`);
  },
  run: async (ctx, input) => {
    const result = await completeTask(
      ctx.user,
      input.task.id,
      taskCompleteInputSchema.parse({ note: input.note ?? null, completedById: input.doneBy?.id ?? null, force: input.force ?? false }),
    );
    const next = result.status === "open" ? ` Next time: ${day(result.dueDate)}.` : "";
    const paid = result.origin?.type === "expense" ? " The payment is marked paid." : "";
    const unblocked = result.unblocked.length ? ` Can start now: ${result.unblocked.map((task) => task.title).join(", ")}.` : "";
    return done(`“${result.title}” is done.${next}${paid}${unblocked}`);
  },
});

registerAssistantTool({
  name: "tasks.change_status",
  description: "Reopen a closed task, skip this time, snooze (move the due date of this time), put on hold with a reason, or resume a task on hold.",
  input: z.object({
    task: entityRef("task"),
    action: z.enum(["reopen", "skip", "snooze", "hold", "resume"]),
    until: optionalDateSchema("snooze: the new due date YYYY-MM-DD"),
    reason: z.string().trim().max(300).optional().describe("hold: why it is on hold; skip: a note"),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed a task's status", nl: "Status van een taak aangepast" },
  describe: (ctx, input) => {
    const name = `“${input.task.name}”`;
    const paymentEn = isPayment(input.task) ? " (the payment becomes unpaid again)" : "";
    const paymentNl = isPayment(input.task) ? " (de betaling wordt weer onbetaald)" : "";
    switch (input.action) {
      case "reopen":
        return say(ctx.locale, `Reopen ${name}${paymentEn}`, `${name} heropenen${paymentNl}`);
      case "skip":
        return say(ctx.locale, `Skip ${name} this time`, `${name} deze keer overslaan`);
      case "snooze":
        return say(ctx.locale, `Move ${name} to ${day(input.until, "en", true)}`, `${name} verplaatsen naar ${day(input.until, "nl", true)}`);
      case "hold":
        return say(ctx.locale, `Put ${name} on hold${input.reason ? `: ${input.reason}` : ""}`, `${name} on hold zetten${input.reason ? `: ${input.reason}` : ""}`);
      case "resume":
        return say(ctx.locale, `Resume ${name}`, `${name} hervatten`);
    }
  },
  run: async (ctx, input) => {
    const id = input.task.id;
    switch (input.action) {
      case "reopen": {
        const task = await reopenTask(ctx.user, id);
        return done(`“${task.title}” is open again${task.origin?.type === "expense" ? "; the payment is unpaid again" : ""}.`);
      }
      case "skip": {
        const task = await skipTask(ctx.user, id, { note: input.reason ?? null });
        return done(`Skipped “${task.title}”.${task.status === "open" ? ` Next time: ${day(task.dueDate)}.` : ""}`);
      }
      case "snooze": {
        if (!input.until) throw badRequest("Give the new date (until)");
        const task = await snoozeTask(ctx.user, id, { until: input.until });
        return done(`“${task.title}” is now due ${day(task.dueDate)}.`);
      }
      case "hold": {
        const task = await holdTask(ctx.user, id, { reason: input.reason ?? null });
        return done(`“${task.title}” is on hold${task.hold?.reason ? `: ${task.hold.reason}` : ""}.`);
      }
      case "resume": {
        const task = await releaseTask(ctx.user, id);
        return done(`“${task.title}” is no longer on hold.`);
      }
    }
  },
});

registerAssistantTool({
  name: "tasks.link",
  description: "Make a task wait for another (blocked_by), make it block another (blocks), mark two tasks related, or remove their link.",
  input: z.object({
    task: entityRef("task"),
    other: entityRef("task", "The other task"),
    kind: z.enum(["blocked_by", "blocks", "related", "remove"]).describe("blocked_by = task waits for other"),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Linked tasks", nl: "Taken gekoppeld" },
  describe: (ctx, input) => {
    const [a, b] = [`“${input.task.name}”`, `“${input.other.name}”`];
    switch (input.kind) {
      case "blocked_by":
        return say(ctx.locale, `${a} waits for ${b}`, `${a} wacht op ${b}`);
      case "blocks":
        return say(ctx.locale, `${b} waits for ${a}`, `${b} wacht op ${a}`);
      case "related":
        return say(ctx.locale, `Mark ${a} and ${b} as related`, `${a} en ${b} als verwant aanduiden`);
      case "remove":
        return say(ctx.locale, `Remove the link between ${a} and ${b}`, `Koppeling tussen ${a} en ${b} weghalen`);
    }
  },
  run: async (ctx, input) => {
    if (input.kind === "remove") {
      await removeTaskLink(ctx.user, input.task.id, input.other.id);
      return done(`Removed the link between “${input.task.name}” and “${input.other.name}”.`);
    }
    await addTaskLink(ctx.user, input.task.id, { otherTaskId: input.other.id, kind: input.kind });
    const text = { blocked_by: `“${input.task.name}” now waits for “${input.other.name}”.`, blocks: `“${input.other.name}” now waits for “${input.task.name}”.`, related: `Linked “${input.task.name}” and “${input.other.name}”.` };
    return done(text[input.kind]);
  },
});

registerAssistantTool({
  name: "tasks.comment",
  description: "Add a comment to a task's thread (everyone may, children too).",
  input: z.object({ task: entityRef("task"), text: z.string().trim().min(1).max(2000) }),
  permission: "write",
  confirm: "first-time",
  roles: ["owner", "adult", "child"],
  activity: { en: "Commented on a task", nl: "Reactie op een taak geplaatst" },
  describe: (ctx, input) => say(ctx.locale, `Comment on “${input.task.name}”: “${input.text}”`, `Reactie bij “${input.task.name}”: “${input.text}”`),
  run: async (ctx, input) => {
    await addTaskComment(ctx.user, input.task.id, { body: input.text });
    return done(`Commented on “${input.task.name}”.`);
  },
});

/** The checklist item a label means: exact first, then the only one containing it. */
export function pickChecklistItem<T extends { label: string }>(items: T[], label: string): T | string {
  const wanted = fold(label);
  const exact = items.filter((item) => fold(item.label) === wanted);
  const partial = exact.length ? exact : items.filter((item) => fold(item.label).includes(wanted) || wanted.includes(fold(item.label)));
  if (partial.length === 1 && partial[0]) return partial[0];
  const known = items.map((item) => `"${item.label}"`).join(", ") || "none";
  return partial.length ? `Which item: ${partial.map((item) => `"${item.label}"`).join(" or ")}?` : `No checklist item "${label}". Items: ${known}.`;
}

registerAssistantTool({
  name: "tasks.check_item",
  description: "Tick off (or untick) one item of a task's checklist.",
  input: z.object({ task: entityRef("task"), item: z.string().trim().min(1).max(200).describe("The checklist item's text"), done: z.boolean().default(true) }),
  permission: "write",
  confirm: "first-time",
  // Children on their own tasks; the service checks it.
  roles: ["owner", "adult", "child"],
  activity: { en: "Ticked a checklist item", nl: "Checklistpunt afgevinkt" },
  describe: (ctx, input) =>
    input.done
      ? say(ctx.locale, `Tick “${input.item}” on “${input.task.name}”`, `“${input.item}” afvinken bij “${input.task.name}”`)
      : say(ctx.locale, `Untick “${input.item}” on “${input.task.name}”`, `“${input.item}” weer openzetten bij “${input.task.name}”`),
  run: async (ctx, input) => {
    const { task } = await getTaskDetail(ctx.user, input.task.id);
    const item = pickChecklistItem(task.checklist, input.item);
    if (typeof item === "string") throw badRequest(item);
    const updated = await toggleChecklistItem(ctx.user, task.id, item.id, { done: input.done });
    const left = updated.checklist.filter((entry) => !entry.done).length;
    return done(`${input.done ? "Ticked" : "Unticked"} “${item.label}”; ${left} of ${updated.checklist.length} left.`);
  },
});

registerAssistantTool({
  name: "tasks.delete",
  description: "Delete a task for good, with its materials. Linked tasks (payments, waste) can't be deleted: skip them instead.",
  input: z.object({ task: entityRef("task") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a task", nl: "Taak verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the task “${input.task.name}”`, `Taak “${input.task.name}” verwijderen`),
  preview: async (ctx, input) => {
    const { task } = await getTaskDetail(ctx.user, input.task.id);
    const fields = [
      { label: say(ctx.locale, "Task", "Taak"), value: task.title },
      task.dueDate && { label: say(ctx.locale, "Due", "Tegen"), value: day(task.dueDate, ctx.locale) ?? task.dueDate },
      task.rrule && { label: say(ctx.locale, "Repeats", "Herhaalt"), value: say(ctx.locale, "the whole series goes", "de hele reeks verdwijnt") },
      task.materials && { label: say(ctx.locale, "Materials", "Materiaal"), value: String(task.materials.total) },
      task.commentCount && { label: say(ctx.locale, "Comments", "Reacties"), value: String(task.commentCount) },
    ].filter((field): field is { label: string; value: string } => Boolean(field));
    return { kind: "fields", data: { fields } };
  },
  run: async (ctx, input) => {
    await deleteTask(ctx.householdId, input.task.id);
    return done(`Deleted “${input.task.name}”.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a task's page and the tasks overview ──

registerScreenContext({
  kind: "task",
  skills: ["tasks"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const { task } = await getTaskDetail(ctx.user, id);
    const facts = [task.status.toLowerCase(), task.dueDate && `due ${day(task.dueDate)}`, task.place && `in "${task.place.name}"`].filter(Boolean);
    return { label: task.title, summary: `task "${task.title}" (${facts.join(", ")})` };
  },
});

registerScreenContext({
  kind: "tasks",
  skills: ["tasks"],
  describe: (ctx) => ({ label: say(ctx.locale, "Tasks", "Taken"), summary: "the tasks overview (the household's open tasks)" }),
});
