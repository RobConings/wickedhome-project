import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_QUIET_HOURS, QuietHoursFields } from "@/features/notifications";

function Stateful(props: React.ComponentProps<typeof QuietHoursFields>) {
  const [value, setValue] = React.useState(props.value);
  return <QuietHoursFields {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Features/Notifications/Components/QuietHoursFields",
  component: QuietHoursFields,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { value: DEFAULT_QUIET_HOURS, onChange: () => undefined },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof QuietHoursFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 22:00–07:00 by default. */
export const Default: Story = {};

export const Off: Story = { args: { value: { ...DEFAULT_QUIET_HOURS, enabled: false } } };

export const Saving: Story = { args: { disabled: true } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
