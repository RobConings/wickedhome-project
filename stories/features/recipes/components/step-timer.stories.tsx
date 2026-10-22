import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepTimer } from "@/features/recipes/components/step-timer";

const meta = {
  title: "Features/Recipes/Components/StepTimer",
  component: StepTimer,
  args: { minutes: 8, label: "Step 2 of 5" },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof StepTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Paused halfway: Resume and Reset. */
export const Paused: Story = { args: { initialSeconds: 4 * 60 + 12 } };
export const LongTimer: Story = { args: { minutes: 90 } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
