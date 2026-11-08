import type { Meta, StoryObj } from "@storybook/react-vite";
import { BanknoteIcon, CalendarClockIcon, ChartNoAxesCombinedIcon, RepeatIcon } from "lucide-react";
import { SectionNavigation } from "@/components/shared/section-navigation";

const meta = {
  title: "Shared/SectionNavigation",
  component: SectionNavigation,
  parameters: { layout: "padded" },
  args: {
    label: "Income views",
    items: [
      { id: "overview", label: "Overview", to: "/income", icon: ChartNoAxesCombinedIcon, current: true },
      { id: "expected", label: "Expected", to: "/income?view=expected", icon: CalendarClockIcon, current: false },
      { id: "received", label: "Received", to: "/income?view=received", icon: BanknoteIcon, current: false },
      { id: "sources", label: "Recurring sources", to: "/income?view=sources", icon: RepeatIcon, current: false },
    ],
  },
} satisfies Meta<typeof SectionNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
