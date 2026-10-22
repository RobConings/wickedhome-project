import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchField } from "@/components/shared/search-field";

const meta = {
  title: "Shared/SearchField",
  component: SearchField,
  args: { value: "", onValueChange: () => {} },
  render: (args) => {
    const [value, setValue] = React.useState(args.value);
    return (
      <div className="flex w-80 flex-col gap-2">
        <SearchField {...args} value={value} onValueChange={setValue} />
        <p className="text-xs text-muted-foreground">Applied query: “{value}”</p>
      </div>
    );
  },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** With text: the clear button appears; Esc clears too. */
export const WithQuery: Story = { args: { value: "kettle" } };
export const CustomPlaceholder: Story = { args: { placeholder: "Search shops…", label: "Search shops" } };
