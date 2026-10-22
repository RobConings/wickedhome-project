import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecurrenceFields } from "@/components/shared/recurrence-fields";

const meta = {
  title: "Shared/RecurrenceFields",
  component: RecurrenceFields,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { name: "rrule", startDate: "2026-10-05" },
} satisfies Meta<typeof RecurrenceFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DoesNotRepeat: Story = {};
export const SchoolDays: Story = { args: { defaultValue: "FREQ=WEEKLY;BYDAY=MO,TU,TH,FR" } };
export const EveryOtherWeekUntil: Story = { args: { defaultValue: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;UNTIL=20270630" } };
export const EveryTenDays: Story = { args: { defaultValue: "FREQ=DAILY;INTERVAL=10" } };
export const MonthlyTenTimes: Story = { args: { defaultValue: "FREQ=MONTHLY;COUNT=10" } };
/** Tasks offer seasons: one occurrence per year, at the start of the season. */
export const EverySpring: Story = { args: { seasons: true, defaultValue: "FREQ=YEARLY;BYMONTH=3,4,5;BYMONTHDAY=1;BYSETPOS=1" } };
export const EveryOtherWinter: Story = {
  args: { seasons: true, defaultValue: "FREQ=YEARLY;INTERVAL=2;BYMONTH=1,2,12;BYMONTHDAY=1;BYSETPOS=-1" },
};
/** Bills: weekly, monthly or yearly, without picking weekdays, and always repeating when editing a series. */
export const BillStyle: Story = {
  args: { frequencies: ["WEEKLY", "MONTHLY", "YEARLY"], weekdays: false, allowNone: false, defaultValue: "FREQ=MONTHLY;INTERVAL=3" },
};
/** The end follows from something else (expenses: a loan's total still open): read-only, the rule ends on that date. */
export const LockedEnd: Story = {
  args: {
    frequencies: ["WEEKLY", "MONTHLY", "YEARLY"],
    weekdays: false,
    allowNone: false,
    defaultValue: "FREQ=MONTHLY",
    lockedEnd: { until: "2027-09-05", description: "After 12 payments, on 5 September 2027 (from the total still open)." },
  },
};
export const WithError: Story = { args: { defaultValue: "FREQ=DAILY", errors: ["This repeat rule isn't supported."] } };
