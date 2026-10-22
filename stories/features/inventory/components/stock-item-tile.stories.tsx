import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StockItemTile } from "@/features/inventory/components/stock-item-tile";
import { stockFixtures } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/StockItemTile",
  component: StockItemTile,
  args: { item: stockFixtures.pasta, onAdjust: fn() },
  decorators: [
    (Story) => (
      <div className="w-44 sm:w-56">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StockItemTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InThePantry: Story = {};
export const RunningLow: Story = { args: { item: stockFixtures.coffee } };
export const Empty: Story = { args: { item: stockFixtures.tablets } };
export const GroupedByPlace: Story = { args: { item: stockFixtures.screws, showPlace: false } };
export const ReadOnly: Story = { args: { onAdjust: undefined } };

/** A −1 / +1 is being saved: the new amount shows at once with a small spinner; the buttons stay usable. */
export const Saving: Story = { args: { pending: true } };
