import type { Meta, StoryObj } from "@storybook/react-vite";
import { WasteTaskSettings } from "@/features/waste/components/waste-task-settings";
import { householdOverviewFixture } from "../../household/fixtures";

const habitants = householdOverviewFixture.habitants;

const meta = {
  title: "Features/Waste/Components/WasteTaskSettings",
  component: WasteTaskSettings,
  parameters: { layout: "padded" },
  args: { settings: { enabled: true, timing: "evening_before", assigneeIds: [], rotate: true }, habitants, canManage: true },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof WasteTaskSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On by default: the evening before at 20:00, nobody in particular. */
export const Default: Story = {};
export const TakingTurns: Story = {
  args: { settings: { enabled: true, timing: "morning_of", assigneeIds: habitants.slice(0, 2).map((habitant) => habitant.id), rotate: true } },
};
export const Off: Story = { args: { settings: { enabled: false, timing: "evening_before", assigneeIds: [], rotate: true } } };
export const ReadOnly: Story = { args: { canManage: false } };
