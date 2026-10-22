import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

const meta = {
  title: "UI/Kbd",
  component: Kbd,
  args: { children: "N" },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Keys pressed one after the other (N, then T = new task) and a chord (Ctrl K). */
export const Groups: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3 text-sm">
      <span className="flex items-center gap-2">
        New task <KbdGroup keys={["N", "T"]} />
      </span>
      <span className="flex items-center gap-2">
        Search <KbdGroup keys={["Ctrl", "K"]} />
      </span>
      <span className="flex items-center gap-2">
        Search on a Mac <KbdGroup keys={["⌘", "K"]} />
      </span>
    </div>
  ),
};
