import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopTypeBadge } from "@/features/shops/components/shop-type-badge";
import { SHOP_TYPES } from "@/features/shops/types/shops";

const meta = {
  title: "Features/Shops/Components/ShopTypeBadge",
  component: ShopTypeBadge,
  args: { type: "supermarket" },
} satisfies Meta<typeof ShopTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllTypes: Story = {
  render: () => (
    <div className="flex max-w-xl flex-wrap gap-2">
      {SHOP_TYPES.map((type) => (
        <ShopTypeBadge key={type} type={type} />
      ))}
    </div>
  ),
};
