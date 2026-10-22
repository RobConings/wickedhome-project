import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StockItemRow } from "@/features/inventory/components/stock-item-row";
import { stockFixtures } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/StockItemRow",
  component: StockItemRow,
  args: { item: stockFixtures.pasta, onAdjust: fn() },
  decorators: [
    (Story) => (
      <ul className="max-w-xl divide-y rounded-xl border bg-card px-3">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof StockItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InThePantry: Story = {};
export const RunningLow: Story = { args: { item: stockFixtures.coffee } };
export const Empty: Story = { args: { item: stockFixtures.tablets } };
export const ScrewsInTheGarage: Story = { args: { item: stockFixtures.screws } };
export const ByProduct: Story = { args: { item: stockFixtures.milk, showProduct: false } };
export const ReadOnly: Story = { args: { onAdjust: undefined } };

/** As a `GeneralList` row (`as="div"`): the list draws the item, dividers and padding. */
export const AsListRow: Story = {
  args: { as: "div", showPlace: false },
  decorators: [
    (Story) => (
      <div className="max-w-xl rounded-xl border bg-card px-4 py-2.5">
        <Story />
      </div>
    ),
  ],
};

/** A −1 / +1 is being saved: the new amount shows at once with a small spinner; the buttons stay usable. */
export const Saving: Story = { args: { pending: true } };
