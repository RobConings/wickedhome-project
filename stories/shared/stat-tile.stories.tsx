import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertTriangleIcon, CalendarClockIcon, CalendarIcon, CircleCheckBigIcon, FileTextIcon, PiggyBankIcon, ShoppingCartIcon } from "lucide-react";
import { StatTile } from "@/components/shared/stat-tile";

const meta = {
  title: "Shared/StatTile",
  component: StatTile,
  args: { label: "This month", value: "€ 1.284,50", hint: "€ 312,00 still to pay", icon: CalendarIcon, className: "w-64" },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Negative: Story = { args: { label: "Overdue", value: "€ 89,95", hint: "1 item", tone: "negative", icon: AlertTriangleIcon } };
export const Warning: Story = { args: { label: "Due soon", value: "3", hint: "In the next 7 days", tone: "warning" } };
export const Positive: Story = { args: { label: "Saved", value: "€ 240,00", hint: "Per year", tone: "positive", icon: PiggyBankIcon } };
export const Soon: Story = { args: { label: "Due soon", value: "2", hint: "This week", tone: "soon", icon: CalendarClockIcon } };
export const Info: Story = { args: { label: "Next month", value: "€ 642,10", hint: "6 items", tone: "info", icon: CalendarClockIcon } };
/** The page's key figure: a full soft fill in the section colour (switch Accent in the toolbar). */
export const Featured: Story = { args: { label: "Per month", value: "€ 64,97", hint: "€ 779,64 per year", tone: "featured" } };
/** Peach: money due, "needs you". */
export const Highlight: Story = { args: { label: "To pay", value: "€ 231,45", hint: "2 this week", tone: "highlight", icon: FileTextIcon } };
export const Neutral: Story = { args: { label: "Battery", value: "–", hint: "Not measured", tone: "neutral" } };

/** Dashboard style: a tile about another section takes that section's colour, and links there. */
export const WithChipAndLink: Story = {
  args: { label: "Tasks", value: "3", hint: "Due today", icon: CircleCheckBigIcon, iconTone: "tasks", to: "/tasks" },
};

export const DashboardRow: Story = {
  render: () => (
    <div className="grid w-[48rem] max-w-full grid-cols-2 gap-4 md:grid-cols-3">
      <StatTile label="Tasks" value="3" hint="Due today" icon={CircleCheckBigIcon} iconTone="tasks" to="/tasks" />
      <StatTile label="Shopping" value="12" hint="Items to buy" icon={ShoppingCartIcon} iconTone="shopping" to="/shopping" />
      <StatTile label="To pay" value="2" hint="€ 231,45 due this week" icon={FileTextIcon} iconTone="finance" tone="highlight" to="/expenses" />
    </div>
  ),
};

/** The Expenses page row (finance accent). */
export const Row: Story = {
  render: () => (
    <div data-accent="finance" className="grid w-[48rem] max-w-full grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile label="This month" value="€ 5.917,80" hint="€ 4.034,54 still to pay" icon={CalendarIcon} tone="featured" />
      <StatTile label="Next month" value="€ 3.660,56" hint="€ 3.660,56 still to pay" icon={CalendarClockIcon} tone="info" />
      <StatTile label="Overdue" value="€ 0,00" hint="Nothing overdue" icon={AlertTriangleIcon} tone="positive" />
    </div>
  ),
};

export const RowWithOverdue: Story = {
  render: () => (
    <div data-accent="finance" className="grid w-[48rem] max-w-full grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile label="This month" value="€ 1.284,50" hint="€ 312,00 still to pay" icon={CalendarIcon} tone="featured" />
      <StatTile label="Next month" value="€ 642,10" hint="6 items" icon={CalendarClockIcon} tone="info" />
      <StatTile label="Overdue" value="€ 89,95" hint="1 item" tone="negative" icon={AlertTriangleIcon} />
    </div>
  ),
};
