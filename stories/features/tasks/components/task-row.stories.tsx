import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { TaskRow } from "@/features/tasks/components/task-row";
import { adultViewer, childViewer, completedTodayFixture, reminderTaskFixture, taskFixtures, taskHabitants, tasksToday, whenTaskFixtures } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskRow",
  component: TaskRow,
  parameters: { layout: "padded" },
  args: { task: taskFixtures.jacuzzi, today: tasksToday, habitants: taskHabitants, viewer: adultViewer },
  decorators: [(Story) => <ul className="max-w-2xl">{Story()}</ul>],
} satisfies Meta<typeof TaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WaitingForMaterials: Story = {};
/** The tasks page's tiles view (`variant="tile"`). */
export const Tile: Story = {
  args: { task: taskFixtures.payFluvius, variant: "tile" },
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
};
/** A row of the tasks page's list (`variant="plain"`): the list draws the dividers and padding. */
export const PlainRow: Story = { args: { task: taskFixtures.vacuum, variant: "plain" } };
export const RotatingWeekly: Story = { args: { task: taskFixtures.vacuum } };
export const OverdueReady: Story = { args: { task: taskFixtures.descale } };
export const SeasonalWithSteps: Story = { args: { task: taskFixtures.gutters } };
export const NoPlaceNoDate: Story = { args: { task: taskFixtures.chimney } };
export const ErrandWithoutPlace: Story = { args: { task: taskFixtures.parcel } };
export const Done: Story = { args: { task: taskFixtures.smokeDetector } };
/** From the waste collection: put the bins out the evening before at 20:00. */
export const LinkedWasteTask: Story = { args: { task: taskFixtures.bins } };
/** Today at 21:00 with a reminder at 20:45 (a bell). */
export const WithTimeAndReminder: Story = { args: { task: reminderTaskFixture } };
/** Every Sunday at 18:00, reminder at the time: "Sunday · 18:00". */
export const EverySundayAtSix: Story = { args: { task: whenTaskFixtures.sundayBath } };
/** A timeslot: "Tomorrow · 10:00–12:00", reminder 30 minutes before the start. */
export const Timeslot: Story = { args: { task: whenTaskFixtures.slot } };
/** Several days, all day: "12/10 – 14/10", reminder a day before at 09:00. */
export const SeveralDays: Story = { args: { task: whenTaskFixtures.severalDays } };
/** The three "when" kinds on a phone: nothing overflows, the meta line wraps. */
export const WhenKindsMobile: Story = {
  render: (args) => (
    <>
      {Object.values(whenTaskFixtures).map((item) => (
        <TaskRow key={item.id} {...args} task={item} />
      ))}
    </>
  ),
  globals: { viewport: { value: "mobile1" } },
};
/** A payment on hold until the invoice is checked; it also waits for that task and has comments. */
export const OnHoldAndWaiting: Story = { args: { task: taskFixtures.payFluvius } };
/** Done today: struck through until tomorrow; tap the check again to undo. */
export const DoneToday: Story = { args: { task: taskFixtures.dishes, completion: completedTodayFixture[0] } };
/** This morning's occurrence of a recurring task, done; the task itself has moved on to its next day. */
export const RecurringDoneToday: Story = { args: { task: taskFixtures.schoolBag, completion: completedTodayFixture[1] } };
/** Lena may complete her own task, but gets no skip/snooze menu. */
export const AsChildOwnTask: Story = { args: { task: taskFixtures.schoolBag, viewer: childViewer } };
export const AsChildSomeoneElsesTask: Story = { args: { task: taskFixtures.jacuzzi, viewer: childViewer } };

const neverSettles = { router: { action: async () => new Promise<never>(() => undefined) } };

/** Ticked off: shown as done at once (optimistic) while it saves. */
export const Completing: Story = {
  parameters: neverSettles,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Mark “Insulate the jacuzzi” as done" }));
  },
};

/** Skipped from the menu: the menu button spins while it saves. */
export const Skipping: Story = {
  parameters: neverSettles,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "More actions for “Insulate the jacuzzi”" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Skip" }));
  },
};
