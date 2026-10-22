import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilterSelect } from "@/components/shared/filter-select";

const meta = {
  title: "Shared/FilterSelect",
  component: FilterSelect,
  parameters: { layout: "padded" },
  args: {
    label: "Kind",
    value: null,
    allLabel: "All kinds",
    options: [
      { value: "fixed", label: "Fixed" },
      { value: "variable", label: "Variable" },
    ],
  },
} satisfies Meta<typeof FilterSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Chosen: Story = { args: { value: "variable" } };
export const Small: Story = { args: { size: "sm", className: "w-full sm:w-40" } };
