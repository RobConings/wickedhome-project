# Tasks

Everything the household has to do: chores, to-dos, jobs, maintenance and errands, plus tasks other
features create (put the bins out, pay a bill). One list; when it's all done, it's all done.

| Part | Browser | API | Data |
|---|---|---|---|
| Tasks, the total list, detail | `features/tasks` | `src/api/tasks/tasks.service.ts`, `tasks.routes.ts` | `tasks`, `task_assignees`, `task_checklist_items`, `task_completions` |
| Comments | `TaskComments` | `task-comments.ts` | `task_comments` |
| Links (waits for, related) | `TaskLinksPanel` | `task-links.ts` | `task_links` |
| Linked tasks (from other features) | `TaskOriginBadge`, `LinkedTaskPanel` | `linked-tasks.ts`, `linked-task-handlers.ts` | `tasks.origin*` |
| Bins tasks | `WasteTaskSettings` (waste) | `src/api/waste/waste-tasks.ts` | `waste_setups.task*` |
| Pay tasks | expense detail route | `pay-tasks.ts` (job `tasks.pay-tasks`) | `tasks` with origin `expense` |

## The total list (`/tasks`)

The default view is **All**: everything open for everyone, from every source, grouped by day: **Overdue,
Today, Tomorrow, This week** (the 7 days after today), **Later**, **Whenever** (no date). On top: **"3 of 5
done today"** with a bar (done today of done today + overdue + due today). Nothing overdue or due today left:
**"All done for today"**; nothing open at all: **"All done"**.

What was closed today stays in its day group, struck through, until tomorrow (`completedToday` in the
overview: completions since local midnight, one-off tasks and occurrences of recurring ones). Each group shows
"2 of 4 done" with a thin bar. Tapping the check of a one-off task closed today undoes it.

Views (Mine, Ready, Overdue, Done), who, type, inside/outside and place filters still apply, also to the
done-today items; grouping by place/type/person shows open tasks only. The dashboard's tasks tile shows the
same "done/total" for today.

The list is a `GeneralList` (`TaskList`): the same search as every list (title, notes, place, type, project,
people), list or tiles (`TaskRow variant="plain" | "tile"`), the view tabs above it and the who/type/
inside-outside/grouping controls in its toolbar. Grouped by place, a group is a place with its floor (floors
from the bottom up, outside last). Done is listed newest first, without day groups. The task form and "Mark as
done" are `GeneralFormDialog`s (the "When" control, reminder, repeat rule, checklist, assignees, priority and
project are custom fields; "take turns" shows with `when` for a repeating task with several people).

## When

Every task has an optional "when" (`taskWhenKind`, `types/tasks.ts`), derived from its columns:

| Kind | Columns | Shown as |
|---|---|---|
| None | no `dueDate` | "Whenever" |
| Day (all day) | `dueDate` | "Tomorrow", "Saturday", "12/10/2026" |
| Time (a moment) | `dueDate` + `dueTime` | "Sunday · 18:00" |
| Timeslot | `dueDate` + `dueTime` (start) + `endTime` (end, same day, later) | "Saturday · 10:00–12:00" |
| Several days | `startDate` (first day) + `dueDate` (last day), always all day | "12/10 – 14/10" |

- `dueDate` stays the day the task is due (for several days: the last day), so overdue, the day groups, the
  digests, links and the dashboard keep working unchanged. A multi-day task in progress sits in the group of its
  last day.
- Several days never have a time (the API answers `daysAllDay`): a time on the first or last day only would
  make reminders, the calendar and overdue harder to read for little gain. At most `MAX_TASK_DAYS` (366) days.
- Validation codes: `endTimeNeedsTime`, `endTimeBeforeStart`, `startDateNeedsDate`, `startDateAfterEnd`,
  `daysTooLong`, `daysAllDay`, `reminderNeedsDate`, `timeNeedsDate` (translated as `tasks:errors.<code>`).
- **Form**: "When" (`TaskWhenField`) is a row of chips (No date / Day / Time / Timeslot / Several days, they wrap)
  with only the inputs that kind needs below it, one column on phones. It posts `dueDate`, `dueTime`, `endTime`,
  `startDate`. Switching kinds keeps what fits (`switchWhenKind`, `types/task-when.ts`): a date is filled in
  (today), several days start on the current day and end the next, a new start time after the end moves the end
  an hour later. Repeats and the reminder come right below it.
- **Rows** show the short form above; the detail page the full one ("zondag 05/10/2026 · 18:00", "ma 12/10/2026 –
  wo 14/10/2026"), and the next dates of a repeating task with the same time, slot or days. Dates go through
  `@/types/date-format` (`formatShortDateRange` drops only the year, within this year).

## Repeating

"Repeats" is a switch right under the "When" in the form. On: presets as chips (**Every Friday** (weekly),
**Every day, Every 2 weeks, Every month, Every year**) with an optional end date, or **Custom** (the shared
`RecurrenceFields`: other intervals, seasons, a number of times). Weekly and every 2 weeks show **weekday
chips**: by default the due date's weekday; pick others ("every Sunday", "Monday and Thursday") and the choice
stays when the date changes. Switching Repeats on without a date fills in today. Rows and the detail say the
rule in words ("Every Sunday" / "Elke zondag"). "Repeat this…" in a task's menu opens its form with Repeats on
(`/tasks/<id>?repeat=1`).

- A new rule (or a new first date) starts on the rule's first day on or after the chosen date (`firstDueDate`):
  "every Sunday" picked on a Thursday is first due on Sunday (the form says "first time zo 04/10/2026"). A
  snoozed due date that stays isn't moved by an edit.
- Completing or skipping a repeating task records the occurrence and moves it to the next date (rotating the
  assignees when set); after the end date it closes. The "when" repeats with it: the same time, the same
  timeslot, the same number of days (`startDate` moves along with `dueDate`, `movedStartDate`), and a new
  reminder for that occurrence. A multi-day task repeats on its last day (the due date): "weekend clean-up
  Sat–Sun, every week" is a weekly rule on Sunday. Snoozing a multi-day task keeps its length too.
- Presets ⇄ RRULE: `types/task-repeat.ts` (tested), incl. `weekdays`.

## On hold

A task can be put on hold with an optional reason ("The invoice looks wrong; recalculate first"): it keeps its
due date and still shows overdue, with an "On hold" badge (and a warning border on its row) until someone
resumes it. Closing a task ends its hold. `POST /api/tasks/:id/hold { reason }`, `POST /api/tasks/:id/release`.

## Links between tasks

- **Waits for** (`BLOCKED_BY`): "Load the dishwasher" waits for "Do the dishes". While a blocker is open the
  row says "Waiting for …" (dashed check) and completing asks "Complete anyway?" (the API answers 409
  `blocked` unless `force`). Completing the last blocker shows "… can start now".
- **Blocks**: the same link seen from the other side.
- **Related**: a plain cross-reference, shown on both tasks.

One link per pair; adding another replaces it. Cycles are refused (`wouldCreateCycle`, tested).
`POST /api/tasks/:id/links { otherTaskId, kind: blocked_by | blocks | related }`, `DELETE /api/tasks/:id/links/:otherTaskId`.

## Comments

A thread per task on the detail page (and in `LinkedTaskPanel`), with a count on rows. Everyone in the
household may comment, children too; only the author edits or deletes. Comments are task-only on purpose:
every thread belongs to a task (a payment's thread is its pay task's), so scoping and cascade come from the
task. `POST/PUT/DELETE /api/tasks/:id/comments[/:commentId]`.

## Linked tasks (for other features)

A feature that wants a task per record calls, from its own API folder:

```ts
import { removeLinkedTask, upsertLinkedTask } from "../tasks/linked-tasks";

await upsertLinkedTask({
  householdId,
  origin: { type: "waste", id: "2026-10-07", date: "2026-10-07", href: "/settings#waste" },
  title: "Put out: Pmd", type: "chore", dueDate: "2026-10-06", dueTime: "20:00", assigneeIds: ["…"],
});
await removeLinkedTask({ householdId, type: "waste", id: "2026-10-07" });
```

- Origin `type` + `id` is unique per household (`@@unique([householdId, originType, originId])`).
- **Idempotent**: a second run writes nothing (`linkedTaskChanges`, tested). Closed tasks are never changed or
  removed. While `origin.date` is unchanged a snoozed due date stays; a moved origin date or a new due time
  moves the task. `assigneeIds` omitted keeps the current ones.
- `rekeyLinkedTask` moves an open task to another origin id (a collection that moved); `completeLinkedTask` /
  `reopenLinkedTask` follow the origin without calling it back; `listLinkedTasks` lists them.
- To hear about people closing or reopening your tasks: `registerLinkedTaskHandler(type, { onClosed, onReopened })`.
- For people they're normal tasks (done/undo, assignees, notes, comments, on hold, links, calendar) with
  "From waste collection" (`tasks:origin.<type>`, link to `origin.href`). The form only changes who and notes;
  they can't be deleted (skip instead), and can't repeat.
- On the origin's page, compose `<LinkedTaskPanel originType originId title onChanged />` in the route.
  `GET /api/tasks/linked?originType&originId` returns the detail (or `null`); `GET /api/tasks/linked/holds?originType`
  gives origin id → hold reason for lists.

### Bins tasks

See [WASTE-WEATHER.md](WASTE-WEATHER.md#bins-tasks).

### Pay tasks

Every unpaid expense paid by hand (any method but a direct debit, or none set) due from 90 days ago up to 14
days ahead gets **"Pay Watergroep · € 52,30"** (errand, origin `expense:<expense id>`, due the day before the
due date, linking to the expense). Assignees: the payer (person), everyone with a share (split), nobody
(joint); a task someone assigned keeps its people.

- Completing the task marks the expense paid (today, by whoever did it); undoing it marks it unpaid.
- Paying or unpaying the expense completes or reopens the task; deleting it, switching to direct debit or
  moving it far ahead removes the open task: the expenses API emits `onExpenseChanged`
  (`src/api/expenses/expense-events.ts`) and `syncExpensePayTask` follows (a no-op when it already matches,
  so the echo of our own "done → paid" is harmless). Expenses never import tasks.
- The daily job `tasks.pay-tasks` (06:25) reconciles everything as a safety net.
- On hold = the payment is on hold: the expenses list and detail show "On hold: <reason>"; the expense detail
  shows the pay task with its blockers and the payment's comment thread (`LinkedTaskPanel`, composed in
  `src/routes/expense-detail.tsx`).

## Time and reminders

- Times are Europe/Brussels wall-clock `HH:MM` (see *When*). Timed tasks sit at their hour in the calendar's day
  and week views (a moment: 30 minutes, or the estimate, max 12 h; a timeslot: from start to end).
- Any task with a date can have a **reminder** (`reminderMinutes`, minutes before its start; `reminderAnchor`):
  - a moment or timeslot counts back from its (start) time: at the time, or 5 min … 1 day before;
  - an all-day task (one day or several) counts back from **09:00 on its (first) day**: on the day at 09:00,
    1 or 2 days or a week before at 09:00 (`ALL_DAY_REMINDER_PRESETS`). All-day tasks never get a reminder
    automatically, only when someone picks one.
- The tasks service keeps `remindAt` (that instant) in sync on create, edit, snooze and every next occurrence of
  a recurring task, and clears `remindedAt` when `remindAt` moves. The push says the when: "Today at 18:00 · in
  15 min", "Saturday 10:00–12:00 · in 30 min", "Today", "Today until 14/10/2026".
- The job `tasks.reminders` (every minute) sends `tasks.reminder` with high priority to the people on duty, else
  the creator (`createdById`), else the household. It is pushed also during quiet hours, because the person chose
  that moment; switching the kind off in Settings stops it. After downtime a reminder < 30 min late is sent once,
  older ones are skipped and marked. Linked tasks (waste, payments) have their own notifications and no reminder.
  Minutes with nothing due leave no run row or console line (`recordIdleRuns: false`, [AUTOMATIONS.md](AUTOMATIONS.md#idle-runs));
  Settings → Automations shows the last real run and the last check.
- The assistant (`ai/skills/tasks`): `tasks.add` / `tasks.update` take `dueDate` (the (first) day), `time`,
  `endTime` (timeslot), `endDate` (last of several days, all day), `repeat` + `weekdays` (`["sun"]`) and `remind`
  (true = at the start, a number = minutes before; all day: from 09:00). "Elke zondag om 18u" → weekly,
  weekdays sun, time 18:00 (first time: today if 18:00 is still to come, else next Sunday); "van 10 tot 12" →
  time + endTime; "van maandag tot woensdag" → dueDate + endDate. On an update a new `dueDate` moves a multi-day
  task with its length; `endDate` on the first day makes it one day; `weekdays` alone makes it weekly on those
  days. `tasks.list_open` / `tasks.details` show `due` as "2026-10-11 18:00", "2026-10-10 10:00-12:00" or
  "2026-10-12 to 2026-10-14". Calendar events stay for appointments.

## Calendar

Open tasks with a due date are the `tasks` calendar source (recurring ones projected ahead, each occurrence with
the same shape): moments are timed entries at their hour, timeslots blocks from start to end, several days one
all-day entry from the first to the last day (a bar across the week and month grids, on each of its days in Day
and Agenda), with a bell when they have a reminder. The calendar has Day, Week, Month and Agenda on every
screen size (phones: week as a list per day, month as compact month + agenda; default Day on a phone, Month elsewhere,
the choice remembered per device). The legend has a
chip per source (Expenses, Waste collection, Birthdays, Tasks…) next to the categories: tap to show only those
(`?sources=tasks,waste`, combined with `?categories=`, filtered in the browser). A source declares its chip with
`kind` (icon) and `labelKey` in `registerCalendarSource`; otherwise `calendar:sources.<id>`.

## Tests

`src/api/tasks/tasks.test.ts` (recurrence, views, the day list and progress, presets, cycles, linked-task
changes, pay-task planning) and `src/api/waste/waste-tasks.test.ts` (bins tasks: timing, rotation, moved and
removed collections, idempotency). Both run with `npm test`.
