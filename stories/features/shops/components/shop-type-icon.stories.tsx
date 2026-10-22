import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopTypeIcon } from "@/features/shops/components/shop-type-icon";
import { SHOP_TYPES } from "@/features/shops/types/shops";

const meta = {
  title: "Features/Shops/Components/ShopTypeIcon",
  component: ShopTypeIcon,
  args: { type: "supermarket", className: "size-6" },
} satisfies Meta<typeof ShopTypeIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllTypes: Story = {
  render: () => (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
      {SHOP_TYPES.map((type) => (
        <div key={type} className="contents">
          <ShopTypeIcon type={type} className="size-5 text-primary" />
          <code>{type}</code>
        </div>
      ))}
    </div>
  ),
};
