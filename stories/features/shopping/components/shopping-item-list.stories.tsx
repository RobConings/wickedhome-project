import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShoppingItemList } from "@/features/shopping/components/shopping-item-list";
import { itemFixtures, shopListFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ShoppingItemList",
  component: ShoppingItemList,
  args: {
    items: [itemFixtures.milk, itemFixtures.bread, itemFixtures.bananas, itemFixtures.tomatoes, itemFixtures.yoghurt],
    shops: shopListFixture,
    onToggle: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShoppingItemList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeeklyGroceries: Story = {};
export const Large: Story = { args: { size: "large", showShop: false, showList: true } };
export const Empty: Story = { args: { items: [], emptyText: "Nothing on this list." } };
