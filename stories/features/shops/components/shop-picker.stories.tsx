import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShopPicker } from "@/features/shops/components/shop-picker";
import { shopListFixture, shopSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopPicker",
  component: ShopPicker,
  args: { shops: shopListFixture, name: "shopId", onChange: fn(), initialSelections: shopSelectionsFixture },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShopPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFavoritesAndRecents: Story = {};
export const Selected: Story = { args: { defaultValue: "s-gamma", clearable: true } };
export const NoHistory: Story = { args: { initialSelections: { favoriteIds: [], recentIds: [] } } };
