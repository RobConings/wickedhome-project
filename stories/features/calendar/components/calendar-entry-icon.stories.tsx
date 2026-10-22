import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarEntryIcon } from "@/features/calendar/components/calendar-entry-icon";
import { CALENDAR_ENTRY_KINDS } from "@/features/calendar/types/calendar";

const meta = {
  title: "Features/Calendar/Components/CalendarEntryIcon",
  component: CalendarEntryIcon,
  args: { kind: "store_visit", className: "size-5" },
  argTypes: { kind: { control: "select", options: CALENDAR_ENTRY_KINDS } },
} satisfies Meta<typeof CalendarEntryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllKinds: Story = {
  render: () => (
    <ul className="flex flex-col gap-2 text-sm">
      {CALENDAR_ENTRY_KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-2">
          <CalendarEntryIcon kind={kind} className="size-4" />
          {kind}
        </li>
      ))}
    </ul>
  ),
};
