import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarDaysIcon, CalendarRangeIcon, ListIcon } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";

const options = [
  { value: "month", label: "Month", icon: CalendarDaysIcon },
  { value: "week", label: "Week", icon: CalendarRangeIcon },
  { value: "agenda", label: "Agenda", icon: ListIcon },
] as const;

const meta = {
  title: "Shared/SegmentedControl",
  component: SegmentedControl,
  args: { label: "View", options, value: "month", onChange: () => {} },
  render: (args) => {
    const [value, setValue] = React.useState(args.value);
    return <SegmentedControl {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof SegmentedControl<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: "sm" } };
export const IconOnly: Story = { args: { iconOnly: true } };
/** 40 px tall: a full touch target, e.g. GeneralList's list/tiles switch. */
export const Large: Story = { args: { size: "lg", iconOnly: true } };
export const TextOnly: Story = {
  args: {
    options: [
      { value: "event", label: "Event" },
      { value: "store_visit", label: "Store visit" },
    ],
    value: "event",
  },
};

const payers = [
  { value: "all", label: "Everyone" },
  { value: "joint", label: "Joint account" },
  { value: "rob", label: "Rob Coppens" },
  { value: "anna", label: "Anna Peeters" },
  { value: "lotte", label: "Lotte" },
  { value: "split", label: "Split" },
];

/** Many options in a narrow box: the control scrolls sideways inside itself (a ScrollRow), never the page. */
export const ManyOptions: Story = {
  args: { label: "Who pays", options: payers, value: "all" },
  decorators: [(Story) => <div className="w-72 rounded-lg border border-dashed p-2">{Story()}</div>],
};

export const Mobile: Story = { ...ManyOptions, decorators: [], globals: { viewport: { value: "mobile1" } } };
