import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardTitle } from "@/components/shared/card";
import { PlaceTasksSection } from "@/features/tasks/components/place-tasks-section";
import { emptyTasksOverviewFixture, jacuzziPlaceOverviewFixture, livingPlaceOverviewFixture, taskHabitants } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/PlaceTasksSection",
  component: PlaceTasksSection,
  parameters: { layout: "padded" },
  // Content only: the place detail page draws this card (and its heading) around the section.
  decorators: [
    (Story) => (
      <Card className="max-w-md gap-2">
        <CardTitle>Tasks</CardTitle>
        {Story()}
      </Card>
    ),
  ],
  args: { placeId: "p-jacuzzi", initialData: { overview: jacuzziPlaceOverviewFixture, habitants: taskHabitants } },
} satisfies Meta<typeof PlaceTasksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Jacuzzi: Story = {};
export const LivingRoom: Story = { args: { placeId: "p-living", initialData: { overview: livingPlaceOverviewFixture, habitants: taskHabitants } } };
export const NothingToDo: Story = { args: { initialData: { overview: emptyTasksOverviewFixture, habitants: taskHabitants } } };
/** Without data and without an API (Storybook), it shows the retry state after loading. */
export const LoadingOrError: Story = { args: { initialData: undefined } };
