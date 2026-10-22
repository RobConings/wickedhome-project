import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToneSelect } from "@/features/devices/components/tone-select";
import type { IndicatorTone } from "@/features/devices/types/devices";

function Demo({ initial = "success" }: { initial?: IndicatorTone }) {
  const [tone, setTone] = React.useState<IndicatorTone>(initial);
  return <ToneSelect value={tone} onChange={setTone} aria-label="Colour" className="w-56" />;
}

const meta = {
  title: "Features/Devices/Components/ToneSelect",
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Danger: Story = { args: { initial: "danger" } };
