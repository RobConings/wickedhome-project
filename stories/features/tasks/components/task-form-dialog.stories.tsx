import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/features/tasks/components/task-form-dialog";
import { reminderTaskFixture, taskFixtures, taskHabitants, taskPlaceSelections, taskPlaces, tasksToday, whenTaskFixtures } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskFormDialog",
  component: TaskFormDialog,
  args: {
    habitants: taskHabitants,
    places: taskPlaces,
    today: tasksToday,
    placeSelections: taskPlaceSelections,
    trigger: <Button>Add task</Button>,
  },
} satisfies Meta<typeof TaskFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const CreateFromPlace: Story = { args: { defaults: { placeId: "p-jacuzzi" } } };
export const CreateJob: Story = { args: { defaults: { type: "job" } } };
export const EditSeasonal: Story = { args: { task: taskFixtures.gutters, trigger: <Button variant="outline">Edit</Button> } };
export const EditRotating: Story = { args: { task: taskFixtures.vacuum, trigger: <Button variant="outline">Edit</Button> } };
/** "Repeat this" from a task's menu: the form opens with Repeats on (weekly on the due date's weekday). */
export const RepeatThis: Story = { args: { task: taskFixtures.parcel, open: true, startRepeating: true, trigger: undefined } };
/** A task with a time and a reminder (15 minutes before): the reminder choice shows once there is a time. */
export const EditWithReminder: Story = { args: { task: reminderTaskFixture, open: true, trigger: undefined } };
/** Every Sunday at 18:00 with a reminder at the time: When = Time, Repeats weekly on Sunday, Reminder below. */
export const EditEverySunday: Story = { args: { task: whenTaskFixtures.sundayBath, open: true, trigger: undefined } };
/** A timeslot (10:00–12:00) with a reminder 30 minutes before the start. */
export const EditTimeslot: Story = { args: { task: whenTaskFixtures.slot, open: true, trigger: undefined } };
/** Several days, all day, reminder a day before at 09:00 (the all-day reminder choices). */
export const EditSeveralDays: Story = { args: { task: whenTaskFixtures.severalDays, open: true, trigger: undefined } };
/** The form on a phone: one column, the When choices and weekday chips wrap, nothing overflows. */
export const Mobile: Story = { args: { task: whenTaskFixtures.sundayBath, open: true, trigger: undefined }, globals: { viewport: { value: "mobile1" } } };
export const MobileTimeslot: Story = { args: { task: whenTaskFixtures.slot, open: true, trigger: undefined }, globals: { viewport: { value: "mobile1" } } };
/** A linked task (waste collection): only who and notes can change. */
export const EditLinked: Story = { args: { task: taskFixtures.bins, trigger: <Button variant="outline">Edit</Button> } };
export const ValidationErrors: Story = {
  parameters: {
    router: {
      action: async () => ({
        intent: "create",
        errors: { title: ["Too small: expected string to have >=1 characters"], dueDate: ["dueDateRequired"], endTime: ["endTimeBeforeStart"] },
      }),
    },
  },
};

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  args: { task: taskFixtures.vacuum, trigger: <Button variant="outline">Edit</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
