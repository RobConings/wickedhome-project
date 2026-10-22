import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "@/components/ui/progress";

const meta = {
  title: "UI/Progress",
  component: Progress,
  args: { value: 40, label: "Importing readings" },
  argTypes: { value: { control: { type: "range", min: 0, max: 100 } } },
  decorators: [(Story) => <div className="w-80"><Story /></div>],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = {};

export const Indeterminate: Story = { args: { value: undefined } };

export const Done: Story = { args: { value: 100 } };
