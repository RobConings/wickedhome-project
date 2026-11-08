import type { Meta, StoryObj } from "@storybook/react-vite";
import { HabitantDetailScreen } from "@/features/household/screens/habitant-detail-screen";
import { habitantFixtures, householdOverviewFixture } from "../fixtures";
const meta = {
  title: "Features/Household/Screens/HabitantDetailScreen", component: HabitantDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { habitant: habitantFixtures.owner, household: householdOverviewFixture.household, canManage: true },
} satisfies Meta<typeof HabitantDetailScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { habitant: habitantFixtures.child, canManage: false } };
export const Pet: Story = { args: { habitant: habitantFixtures.pet } };
