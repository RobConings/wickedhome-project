import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShoppingItemRow } from "@/features/shopping/components/shopping-item-row";
import { shopFixtures } from "../../shops/fixtures";
import { itemFixtures } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ShoppingItemRow",
  component: ShoppingItemRow,
  args: { item: itemFixtures.milk, shop: shopFixtures.colruyt, onToggle: fn() },
  decorators: [
    (Story) => (
      <ul className="max-w-xl divide-y rounded-xl border bg-card px-3">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ShoppingItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeeklyStaple: Story = {};
export const WithNote: Story = { args: { item: itemFixtures.tomatoes, onDelete: fn() } };
export const TaskMaterialWithLink: Story = {
  args: { item: itemFixtures.nailGun, shop: shopFixtures.gamma, taskTitle: "Insulate the jacuzzi", onDelete: fn() },
};
export const LowStock: Story = { args: { item: itemFixtures.coffee, showList: true } };
export const AtMinimum: Story = { args: { item: itemFixtures.tablets, showList: true } };
export const EssentialBelowMinimum: Story = { args: { item: { ...itemFixtures.coffee, isEssential: true }, showList: true } };
export const EssentialAtMinimum: Story = { args: { item: { ...itemFixtures.tablets, isEssential: true }, showList: true } };
export const StockReplenished: Story = { args: { item: { ...itemFixtures.coffee, stockStatus: "above_minimum" }, showList: true } };
export const ManualEssentialAtMinimum: Story = { args: { item: { ...itemFixtures.bananas, isEssential: true, stockStatus: "at_minimum" }, size: "large", showShop: false } };
export const Bought: Story = { args: { item: itemFixtures.yoghurt } };
export const NoShop: Story = { args: { item: itemFixtures.candles, shop: null } };
export const LargeInTheShop: Story = { args: { item: itemFixtures.bananas, size: "large", showShop: false, showList: true } };
/** Alternatives: other brands that share the product's stock, with their webshop links. */
export const WithAlternatives: Story = { args: { item: itemFixtures.bacon, showList: true } };
export const WithAlternativesMobile: Story = { ...WithAlternatives, globals: { viewport: { value: "mobile1" } } };
