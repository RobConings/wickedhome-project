import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateBlock } from "@/components/shared/date-block";

const meta = {
  title: "Shared/DateBlock",
  component: DateBlock,
  args: { date: "2026-10-12" },
} satisfies Meta<typeof DateBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Next to an item, as in an "Upcoming" list. */
export const InAList: Story = {
  render: () => (
    <ul className="flex w-80 flex-col gap-3">
      {[
        ["2026-10-05", "Engie", "Bill · € 142,00"],
        ["2026-10-12", "Netflix", "Renewal · € 13,49"],
        ["2026-10-31", "Clean the gutters", "Task · Garden"],
      ].map(([date, title, detail]) => (
        <li key={date} className="flex items-center gap-3">
          <DateBlock date={date ?? ""} />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">{detail}</span>
          </div>
        </li>
      ))}
    </ul>
  ),
};
