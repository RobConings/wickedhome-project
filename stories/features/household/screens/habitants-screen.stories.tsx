import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { householdOverviewFixture } from "../fixtures";
import { HabitantsScreen } from "@/features/household/screens/habitants-screen";

const meta = {
  title: "Features/Household/Screens/HabitantsScreen",
  component: HabitantsScreen,
  parameters: { layout: "fullscreen" },
  args: { overview: householdOverviewFixture, canManage: true },
} satisfies Meta<typeof HabitantsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { overview: { ...householdOverviewFixture, habitants: [] } } };
/** Search matches name, emoji and type ("pet", "kind"…); the list/tiles switch is remembered. */
export const Search: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "pet");
  },
};
