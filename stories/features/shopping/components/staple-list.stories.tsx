import type { Meta, StoryObj } from "@storybook/react-vite";
import { StapleList } from "@/features/shopping/components/staple-list";
import { productListFixture, shopListFixture, shoppingOverviewFixture, stapleFixtures } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/StapleList",
  component: StapleList,
  args: { staples: stapleFixtures, lists: shoppingOverviewFixture.lists, products: productListFixture, shops: shopListFixture, canManage: true },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border bg-card px-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StapleList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeeklyGroceries: Story = {};
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { staples: [] } };
