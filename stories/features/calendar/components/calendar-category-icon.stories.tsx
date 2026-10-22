import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { CalendarCategoryIcon } from "@/features/calendar/components/calendar-category-icon";
import { CALENDAR_CATEGORIES, CALENDAR_CATEGORY_COLORS } from "@/features/calendar/types/calendar";

const meta = {
  title: "Features/Calendar/Components/CalendarCategoryIcon",
  component: CalendarCategoryIcon,
  args: { category: "holiday", colored: true, className: "size-6" },
} satisfies Meta<typeof CalendarCategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Holiday: Story = {};

function AllCategories() {
  const { t } = useTranslation("calendar");
  return (
    <ul className="grid w-80 gap-2">
      {CALENDAR_CATEGORIES.map((category) => (
        <li key={category} className="flex items-center gap-3 text-sm">
          <span
            className="grid size-7 place-items-center rounded-full text-white"
            style={{ backgroundColor: CALENDAR_CATEGORY_COLORS[category] }}
          >
            <CalendarCategoryIcon category={category} className="size-4" />
          </span>
          {t(`categories.${category}`)}
        </li>
      ))}
    </ul>
  );
}

/** Every category has its own colour (a design token) and icon. */
export const All: Story = { render: () => <AllCategories /> };
