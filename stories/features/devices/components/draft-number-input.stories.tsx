import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DraftNumberInput } from "@/features/devices/components/draft-number-input";

function Demo({ initial = 21.5 }: { initial?: number | null }) {
  const [value, setValue] = React.useState<number | null>(initial);
  return (
    <div className="flex w-60 flex-col gap-2 text-sm">
      <DraftNumberInput value={value} onChange={setValue} aria-label="Temperature" placeholder="Unknown" />
      <span className="text-muted-foreground">Value: {value === null ? "null" : value}</span>
    </div>
  );
}

const meta = {
  title: "Features/Devices/Components/DraftNumberInput",
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Type "18," or "-": the field keeps the text and reports a number when it is one. */
export const Default: Story = {};
export const Empty: Story = { args: { initial: null } };
