import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopSummaryList } from "@/features/shopping/components/shop-summary-list";
import { itemListFixture, shopListFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ShopSummaryList",
  component: ShopSummaryList,
  args: { items: itemListFixture, shops: shopListFixture },
  decorators: [
    (Story) => (
      <div className="max-w-sm rounded-xl border bg-card p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShopSummaryList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ColruytGammaAndNoShop: Story = {};
export const ActiveShop: Story = { args: { activeKey: "s-gamma" } };
