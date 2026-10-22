import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarCategoryFilter } from "@/features/calendar/components/calendar-category-filter";
import type { CalendarSourceChip } from "@/features/calendar/components/calendar-category-filter";
import type { CalendarCategory } from "@/features/calendar/types/calendar";

/** The overlay sources as the calendar screen builds them (labels already translated). */
const sources: CalendarSourceChip[] = [
  { id: "expenses", kind: "bill", label: "Expenses" },
  { id: "waste", kind: "waste", label: "Waste collection" },
  { id: "birthdays", kind: "birthday", label: "Birthdays" },
  { id: "tasks", kind: "task", label: "Tasks" },
];

const meta = {
  title: "Features/Calendar/Components/CalendarCategoryFilter",
  component: CalendarCategoryFilter,
  parameters: { layout: "padded" },
  args: { selected: [], onChange: () => {} },
} satisfies Meta<typeof CalendarCategoryFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing selected: it reads as the legend. */
export const Legend: Story = {};
export const Filtering: Story = { args: { selected: ["holiday", "family"] } };
/** Categories plus the overlay sources (expenses, waste collection, birthdays, tasks) as toggle chips. */
export const WithSources: Story = { args: { sources } };
/** Only the waste collection and the bins tasks. */
export const FilteringBySource: Story = { args: { sources, selectedSources: ["waste", "tasks"] } };

function Interactive() {
  const [selected, setSelected] = React.useState<CalendarCategory[]>([]);
  const [selectedSources, setSelectedSources] = React.useState<string[]>([]);
  return (
    <CalendarCategoryFilter
      selected={selected}
      sources={sources}
      selectedSources={selectedSources}
      onChange={(categories, nextSources) => {
        setSelected(categories);
        setSelectedSources(nextSources);
      }}
    />
  );
}
export const TryIt: Story = { render: () => <Interactive /> };
/** Phones scroll the chips sideways. */
export const Narrow: Story = { args: { sources }, decorators: [(Story) => <div className="max-w-xs">{Story()}</div>] };
export const Mobile: Story = { args: { sources }, globals: { viewport: { value: "mobile1" } } };
