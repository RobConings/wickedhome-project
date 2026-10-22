import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PeriodNavigator } from "@/components/shared/period-navigator";

const meta = {
  title: "Shared/PeriodNavigator",
  component: PeriodNavigator,
  args: {
    label: "October 2026",
    previousLabel: "Previous",
    nextLabel: "Next",
    todayLabel: "Today",
    onPrevious: () => {},
    onNext: () => {},
    onToday: () => {},
  },
} satisfies Meta<typeof PeriodNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const CurrentPeriod: Story = { args: { isCurrent: true } };
export const WithoutToday: Story = { args: { onToday: undefined, label: "28/09/2026 – 04/10/2026" } };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Steps through months. */
export const Interactive: Story = {
  render: (args) => {
    const [month, setMonth] = React.useState(9);
    return (
      <PeriodNavigator
        {...args}
        label={`${MONTHS[((month % 12) + 12) % 12]} ${2026 + Math.floor(month / 12)}`}
        onPrevious={() => setMonth((value) => value - 1)}
        onNext={() => setMonth((value) => value + 1)}
        onToday={() => setMonth(9)}
        isCurrent={month === 9}
      />
    );
  },
};

/** The new period is still loading. */
export const Pending: Story = { args: { pending: true } };
