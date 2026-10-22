import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { CalendarEventFormDialog } from "@/features/calendar/components/calendar-event-form-dialog";
import { TODAY, calendarEventFixtures, calendarHabitants, calendarShopSelections, calendarShops } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarEventFormDialog",
  component: CalendarEventFormDialog,
  args: {
    trigger: <Button>New event</Button>,
    habitants: calendarHabitants,
    shops: calendarShops,
    defaults: { date: TODAY },
    initialShopSelections: calendarShopSelections,
  },
} satisfies Meta<typeof CalendarEventFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
/** Opened by clicking 15:00 on a day in the week view. */
export const CreateAtTime: Story = { args: { defaults: { date: "2026-10-08", time: "15:00" } } };
export const PlanStoreVisit: Story = {
  args: { trigger: <Button>Plan a visit to Gamma</Button>, defaults: { date: "2026-10-10", time: "10:00", kind: "store_visit", shopId: "s-gamma" } },
};
export const EditRecurring: Story = {
  args: { event: calendarEventFixtures.schoolRun, trigger: <Button variant="outline">Edit school drop-off</Button> },
};
export const EditStoreVisit: Story = {
  args: { event: calendarEventFixtures.gamma, trigger: <Button variant="outline">Edit Gamma visit</Button> },
};
export const EditAllDay: Story = {
  args: { event: calendarEventFixtures.autumnBreak, trigger: <Button variant="outline">Edit autumn break</Button> },
};
export const ValidationErrors: Story = {
  parameters: {
    router: {
      action: async () => ({
        intent: "create",
        errors: { title: ["Too small: expected string to have >=1 characters"], endTime: ["endBeforeStart"] },
      }),
    },
  },
};

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  args: { event: calendarEventFixtures.schoolRun, trigger: <Button variant="outline">Edit school drop-off</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit school drop-off" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
