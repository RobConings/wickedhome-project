import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopShoppingList } from "@/features/shopping/components/shop-shopping-list";
import { failApi, itemFixtures, stallApi } from "../fixtures";

const colruytItems = [itemFixtures.milk, itemFixtures.bread, itemFixtures.eggs, itemFixtures.bananas, itemFixtures.tomatoes, itemFixtures.coffee, itemFixtures.tablets];

const meta = {
  title: "Features/Shopping/Components/ShopShoppingList",
  component: ShopShoppingList,
  args: { shopId: "s-colruyt", initialItems: colruytItems },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShopShoppingList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colruyt: Story = {};
/** As shown inside a store visit in the calendar. */
export const LimitedInStoreVisit: Story = { args: { limit: 4 } };
export const GammaForTheJacuzzi: Story = { args: { shopId: "s-gamma", initialItems: [itemFixtures.nailGun, itemFixtures.sheeting, itemFixtures.screws] } };
export const Empty: Story = { args: { initialItems: [] } };

/** First load: placeholder rows shaped like the list. */
export const Loading: Story = { args: { initialItems: undefined }, beforeEach: stallApi };
/** The first load failed: an error with "Try again" instead of an endless skeleton. */
export const LoadFailed: Story = { args: { initialItems: undefined }, beforeEach: failApi };
