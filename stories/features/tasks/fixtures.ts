import type { Place } from "@/features/places/types/places";
import {
  taskReadiness,
  upcomingDueDates,
  type Task,
  type TaskCompletedToday,
  type TaskDetail,
  type TaskPlace,
  type TasksOverview,
  type TaskViewer,
} from "@/features/tasks/types/tasks";
import { habitantFixtures, householdOverviewFixture } from "../household/fixtures";
import { floorFixtures, placeFixtures } from "../places/fixtures";

/** Stories are pinned to one day (a Friday), so due labels and overdue states never drift. */
export const tasksToday = "2026-10-02";

const { owner: rob, partner: sofie, child: lena } = habitantFixtures;

export const taskHabitants = householdOverviewFixture.habitants;
export const taskPlaces: Place[] = Object.values(placeFixtures);

const floors = Object.values(floorFixtures);
const placeOf = (place: Place): TaskPlace => ({
  id: place.id,
  name: place.name,
  kind: place.kind,
  color: place.color,
  icon: place.icon,
  floorId: place.floorId,
  floorName: place.floorName,
  floorLevel: floors.find((floor) => floor.id === place.floorId)?.level ?? 0,
});

type TaskSeed = Pick<Task, "id" | "title"> & Partial<Omit<Task, "readiness">>;

const task = (seed: TaskSeed): Task => {
  const full = {
    notes: null,
    type: "chore" as const,
    place: null,
    assigneeIds: [],
    rotateAssignees: false,
    priority: "normal" as const,
    estimatedMinutes: null,
    status: "open" as const,
    dueDate: null,
    rrule: null,
    recurrenceStart: null,
    checklist: [],
    materials: null,
    closedAt: null,
    dueTime: null,
    endTime: null,
    startDate: null,
    reminderMinutes: null,
    remindAt: null,
    remindedAt: null,
    origin: null,
    hold: null,
    waitingFor: [],
    commentCount: 0,
    project: null,
    ...seed,
  };
  return { ...full, readiness: taskReadiness(full) };
};

const steps = (...labels: [string, boolean?][]) =>
  labels.map(([label, done = false], index) => ({ id: `c${index + 1}`, label, done }));

export const taskFixtures = {
  /** Outside, every spring, with steps. */
  gutters: task({
    id: "t-gutters",
    title: "Clean the gutters",
    type: "maintenance",
    place: placeOf(placeFixtures.frontYard),
    assigneeIds: [rob.id],
    estimatedMinutes: 120,
    dueDate: "2027-03-01",
    rrule: "FREQ=YEARLY;BYMONTH=3,4,5;BYMONTHDAY=1;BYSETPOS=1",
    recurrenceStart: "2026-03-01",
    checklist: steps(["Get the ladder from the shed"], ["Scoop out the leaves"], ["Flush the downpipes with the hose"]),
    notes: "The left downpipe clogs first. Gloves are in the shed.",
  }),
  /** Garden › Jacuzzi, waiting for its two materials (insulation boards and a nail gun). */
  jacuzzi: task({
    id: "t-jacuzzi",
    title: "Insulate the jacuzzi",
    type: "job",
    place: placeOf(placeFixtures.jacuzzi),
    assigneeIds: [rob.id, sofie.id],
    priority: "high",
    estimatedMinutes: 240,
    dueDate: "2026-10-10",
    materials: { total: 2, bought: 0 },
    checklist: steps(["Measure the panels"], ["Cut the insulation boards"], ["Fix the boards with the nail gun"], ["Close the skirting"]),
    notes: "Before the first frost. Insulation boards and the nail gun are on the Gamma list.",
  }),
  /** Living room, every Saturday, taking turns. */
  vacuum: task({
    id: "t-vacuum",
    title: "Weekly vacuum",
    place: placeOf(placeFixtures.living),
    assigneeIds: [lena.id, rob.id, sofie.id],
    rotateAssignees: true,
    estimatedMinutes: 30,
    dueDate: "2026-10-03",
    rrule: "FREQ=WEEKLY;BYDAY=SA",
    recurrenceStart: "2026-01-03",
  }),
  /** A chore for Lena, every school evening; not tied to a place. */
  schoolBag: task({
    id: "t-school-bag",
    title: "School bag check",
    assigneeIds: [lena.id],
    estimatedMinutes: 15,
    dueDate: "2026-10-04",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,SU",
    recurrenceStart: "2026-09-01",
    checklist: steps(["Homework in the folder"], ["Gym clothes on Tuesday"], ["Swimming bag on Thursday"]),
  }),
  /** Overdue, materials all bought: ready to start. */
  descale: task({
    id: "t-descale",
    title: "Descale the coffee machine",
    type: "maintenance",
    place: placeOf(placeFixtures.kitchen),
    assigneeIds: [sofie.id],
    estimatedMinutes: 30,
    dueDate: "2026-09-28",
    rrule: "FREQ=MONTHLY",
    recurrenceStart: "2026-01-28",
    materials: { total: 1, bought: 1 },
  }),
  mow: task({
    id: "t-mow",
    title: "Mow the lawn",
    place: placeOf(placeFixtures.garden),
    assigneeIds: [rob.id],
    estimatedMinutes: 60,
    dueDate: "2026-10-02",
    rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR",
    recurrenceStart: "2026-04-03",
  }),
  chimney: task({
    id: "t-chimney",
    title: "Call the chimney sweep",
    type: "todo",
    assigneeIds: [sofie.id],
    priority: "low",
  }),
  /** An errand without a place. */
  parcel: task({
    id: "t-parcel",
    title: "Bring the parcel to the post office",
    type: "errand",
    assigneeIds: [sofie.id],
    dueDate: "2026-10-05",
    notes: "Return for the jacket; the label is in the parcel.",
  }),
  smokeDetector: task({
    id: "t-smoke",
    title: "Replace the smoke detector battery",
    type: "maintenance",
    place: placeOf(placeFixtures.bedroom),
    assigneeIds: [rob.id],
    estimatedMinutes: 15,
    dueDate: "2026-09-30",
    status: "done",
    closedAt: "2026-09-30T18:42:00.000Z",
  }),
  /** A linked task from the waste collection: due the evening before, at 20:00. */
  bins: task({
    id: "t-bins",
    title: "Put out: Pmd + Papier & karton",
    type: "chore",
    assigneeIds: [sofie.id],
    dueDate: "2026-10-02",
    dueTime: "20:00",
    origin: { type: "waste", id: "2026-10-03", date: "2026-10-03", href: "/settings#waste" },
  }),
  /** A pay task on hold until the invoice is checked; it waits for that task. */
  payFluvius: task({
    id: "t-pay-fluvius",
    title: "Pay Fluvius · € 184,20",
    type: "errand",
    assigneeIds: [rob.id],
    dueDate: "2026-10-01",
    origin: { type: "expense", id: "x-fluvius", date: "2026-10-02", href: "/expenses/x-fluvius" },
    hold: { since: "2026-09-29T19:00:00.000Z", reason: "The invoice looks too high; recalculate it first" },
    waitingFor: [{ id: "t-invoice", title: "Calculate the Fluvius invoice", status: "open", dueDate: "2026-10-02" }],
    commentCount: 2,
  }),
  invoice: task({
    id: "t-invoice",
    title: "Calculate the Fluvius invoice",
    type: "todo",
    assigneeIds: [rob.id],
    dueDate: "2026-10-02",
    commentCount: 1,
  }),
  /** Done today (one-off): stays struck through until tomorrow. */
  dishes: task({
    id: "t-dishes",
    title: "Do the dishes",
    type: "chore",
    assigneeIds: [lena.id],
    dueDate: "2026-10-02",
    status: "done",
    closedAt: "2026-10-02T17:05:00.000Z",
  }),
  /** Waits for the dishes, which are done: actionable again. */
  dishwasher: task({
    id: "t-dishwasher",
    title: "Load the dishwasher",
    type: "chore",
    assigneeIds: [lena.id],
    dueDate: "2026-10-02",
  }),
} satisfies Record<string, Task>;

/** "Remind me at 21:00 to put the bins out" (15 minutes before): a to-do with a time and a reminder, today. */
export const reminderTaskFixture: Task = task({
  id: "t-reminder",
  title: "Put the bins out",
  type: "todo",
  assigneeIds: [rob.id],
  dueDate: tasksToday,
  dueTime: "21:00",
  reminderMinutes: 15,
  remindAt: "2026-10-02T18:45:00.000Z",
});

/**
 * The "when" kinds (today is Friday 02/10/2026): every Sunday at 18:00 with a reminder at the time, a timeslot on
 * Saturday 10:00–12:00, and several days 12/10 → 14/10 (all day, reminder a day before at 09:00).
 */
export const whenTaskFixtures = {
  sundayBath: task({
    id: "t-sunday-bath",
    title: "Wash Daan",
    type: "chore",
    assigneeIds: [rob.id],
    dueDate: "2026-10-04",
    dueTime: "18:00",
    reminderMinutes: 0,
    remindAt: "2026-10-04T16:00:00.000Z",
    rrule: "FREQ=WEEKLY;BYDAY=SU",
    recurrenceStart: "2026-10-04",
  }),
  slot: task({
    id: "t-slot",
    title: "Clear out the garage",
    type: "job",
    assigneeIds: [rob.id, sofie.id],
    dueDate: "2026-10-03",
    dueTime: "10:00",
    endTime: "12:00",
    reminderMinutes: 30,
    remindAt: "2026-10-03T07:30:00.000Z",
  }),
  severalDays: task({
    id: "t-several-days",
    title: "Prepare the holiday",
    type: "todo",
    assigneeIds: [sofie.id],
    startDate: "2026-10-12",
    dueDate: "2026-10-14",
    reminderMinutes: 1440,
    remindAt: "2026-10-11T07:00:00.000Z",
  }),
};

/** Closed today: the dishes (one-off) and this morning's school bag (recurring, moved on to its next day). */
export const completedTodayFixture: TaskCompletedToday[] = [
  { completionId: "c-dishes", taskId: "t-dishes", outcome: "done", occurrenceDate: "2026-10-02", completedAt: "2026-10-02T17:05:00.000Z", completedById: lena.id },
  { completionId: "c-bag", taskId: "t-school-bag", outcome: "done", occurrenceDate: "2026-10-02", completedAt: "2026-10-02T07:10:00.000Z", completedById: lena.id },
];

export const adultViewer: TaskViewer = { habitantId: rob.id, canManage: true };
export const childViewer: TaskViewer = { habitantId: lena.id, canManage: false };

export const tasksOverviewFixture: TasksOverview = {
  today: tasksToday,
  viewer: adultViewer,
  tasks: Object.values(taskFixtures),
  completedToday: completedTodayFixture,
};

export const emptyTasksOverviewFixture: TasksOverview = { today: tasksToday, viewer: adultViewer, tasks: [], completedToday: [] };

/** Everything for today is done (later tasks remain): the "All done for today" state. */
export const allDoneTodayOverviewFixture: TasksOverview = {
  today: tasksToday,
  viewer: adultViewer,
  tasks: [taskFixtures.gutters, taskFixtures.jacuzzi, taskFixtures.parcel, taskFixtures.dishes],
  completedToday: completedTodayFixture.slice(0, 1),
};

/** Nothing open at all: "All done". */
export const allDoneOverviewFixture: TasksOverview = {
  today: tasksToday,
  viewer: adultViewer,
  tasks: [taskFixtures.dishes, taskFixtures.smokeDetector],
  completedToday: completedTodayFixture.slice(0, 1),
};

/** What a place page sees: the tasks of Garden › Jacuzzi. */
export const jacuzziPlaceOverviewFixture: TasksOverview = {
  today: tasksToday,
  viewer: adultViewer,
  tasks: [taskFixtures.jacuzzi],
  completedToday: [],
};

export const livingPlaceOverviewFixture: TasksOverview = {
  today: tasksToday,
  viewer: adultViewer,
  tasks: [taskFixtures.vacuum],
  completedToday: [],
};

export const vacuumDetailFixture: TaskDetail = {
  today: tasksToday,
  viewer: adultViewer,
  task: taskFixtures.vacuum,
  history: [
    { id: "h1", outcome: "done", occurrenceDate: "2026-09-26", completedAt: "2026-09-26T09:15:00.000Z", completedById: sofie.id, note: "Under the couch too." },
    { id: "h2", outcome: "done", occurrenceDate: "2026-09-19", completedAt: "2026-09-19T15:40:00.000Z", completedById: rob.id, note: null },
    { id: "h3", outcome: "skipped", occurrenceDate: "2026-09-12", completedAt: "2026-09-12T08:00:00.000Z", completedById: rob.id, note: "Away for the weekend." },
  ],
  upcoming: upcomingDueDates(taskFixtures.vacuum, "2026-10-03"),
  links: { blockedBy: [], blocks: [], related: [] },
  comments: [],
};

export const jacuzziDetailFixture: TaskDetail = {
  today: tasksToday,
  viewer: adultViewer,
  task: taskFixtures.jacuzzi,
  history: [],
  upcoming: [],
  links: {
    blockedBy: [{ id: "t-diy", title: "Buy materials at the DIY store", status: "done", dueDate: "2026-10-01" }],
    blocks: [],
    related: [{ id: "t-gutters", title: "Clean the gutters", status: "open", dueDate: "2027-03-01" }],
  },
  comments: [],
};

export const doneTaskDetailFixture: TaskDetail = {
  today: tasksToday,
  viewer: adultViewer,
  task: taskFixtures.smokeDetector,
  history: [{ id: "h4", outcome: "done", occurrenceDate: "2026-09-30", completedAt: "2026-09-30T18:42:00.000Z", completedById: rob.id, note: "9V battery from the drawer in the hall." }],
  upcoming: [],
  links: { blockedBy: [], blocks: [], related: [] },
  comments: [],
};

/** A pay task on hold, waiting for the invoice check, with its thread: the payment's comments. */
export const payTaskDetailFixture: TaskDetail = {
  today: tasksToday,
  viewer: adultViewer,
  task: taskFixtures.payFluvius,
  history: [],
  upcoming: [],
  links: {
    blockedBy: [{ id: "t-invoice", title: "Calculate the Fluvius invoice", status: "open", dueDate: "2026-10-02" }],
    blocks: [],
    related: [],
  },
  comments: [
    {
      id: "m1",
      body: "This is twice last month's amount. I'll compare it with the meter readings.",
      authorId: "u-rob",
      authorName: rob.name,
      authorHabitantId: rob.id,
      createdAt: "2026-09-29T19:02:00.000Z",
      editedAt: null,
      mine: true,
    },
    {
      id: "m2",
      body: "The heat pump ran a lot in September, could be right.",
      authorId: "u-sofie",
      authorName: sofie.name,
      authorHabitantId: sofie.id,
      createdAt: "2026-09-30T07:45:00.000Z",
      editedAt: "2026-09-30T07:47:00.000Z",
      mine: false,
    },
  ],
};

/** The linked waste task's detail. */
export const binsTaskDetailFixture: TaskDetail = {
  today: tasksToday,
  viewer: adultViewer,
  task: taskFixtures.bins,
  history: [],
  upcoming: [],
  links: { blockedBy: [], blocks: [], related: [] },
  comments: [],
};

export const taskPlaceSelections = { favoriteIds: ["p-garden", "p-kitchen"], recentIds: ["p-jacuzzi", "p-living"] };
