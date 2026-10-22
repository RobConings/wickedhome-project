import type { Meta, StoryObj } from "@storybook/react-vite";
import { CakeIcon, CalendarIcon, ListChecksIcon, ShoppingBagIcon } from "lucide-react";
import { TimelineList } from "@/components/shared/timeline-list";

const meta = {
  title: "Shared/TimelineList",
  component: TimelineList,
  decorators: [(Story) => <div className="w-96 rounded-xl border bg-card p-5">{Story()}</div>],
  args: {
    items: [
      { id: "1", time: "All day", icon: <CakeIcon />, tone: "highlight", title: "Lena turns 10", subtitle: "Birthday" },
      { id: "2", time: "All day", icon: <ListChecksIcon />, tone: "success", title: "Water the plants", subtitle: "Living room", href: "/tasks/t1" },
      { id: "3", time: "08:15", icon: <CalendarIcon />, tone: "primary", title: "School run", subtitle: "Basisschool De Linde" },
      { id: "4", time: "17:30", icon: <ShoppingBagIcon />, tone: "warning", title: "Colruyt", subtitle: "Store visit", href: "/calendar" },
    ],
  },
} satisfies Meta<typeof TimelineList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const OneItem: Story = {
  args: { items: [{ id: "1", time: "10:00", icon: <CalendarIcon />, title: "Dentist", subtitle: "Dr. Peeters" }] },
};
export const LongTitles: Story = {
  args: {
    items: [
      { id: "1", time: "Hele dag", icon: <ListChecksIcon />, tone: "success", title: "Replace the filter of the heat-pump ventilation unit in the attic", subtitle: "Attic · 45 minutes" },
      { id: "2", time: "21:00", icon: <CalendarIcon />, title: "Parents' evening", subtitle: "A very long location name that does not fit on one line" },
    ],
  },
};
