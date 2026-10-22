import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShopTypeFilter } from "@/features/shops/components/shop-type-filter";
import { SHOP_TYPES, type ShopType } from "@/features/shops/types/shops";

const meta = {
  title: "Features/Shops/Components/ShopTypeFilter",
  component: ShopTypeFilter,
  args: { types: ["supermarket", "diy", "drugstore", "online"], value: null, onChange: fn() },
  render: function Render(args) {
    const [value, setValue] = React.useState<ShopType | null>(args.value);
    return (
      <div className="max-w-2xl">
        <ShopTypeFilter
          {...args}
          value={value}
          onChange={(type) => {
            setValue(type);
            args.onChange(type);
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof ShopTypeFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { value: "diy" } };
export const AllTypes: Story = { args: { types: SHOP_TYPES } };

/** Phones: one row that scrolls sideways inside itself. */
export const Mobile: Story = { args: { types: SHOP_TYPES }, globals: { viewport: { value: "mobile1" } } };
