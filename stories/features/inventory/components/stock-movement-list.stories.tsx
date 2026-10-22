import type { Meta, StoryObj } from "@storybook/react-vite";
import { StockMovementList } from "@/features/inventory/components/stock-movement-list";
import { coffeeStockFixture } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/StockMovementList",
  component: StockMovementList,
  args: { movements: coffeeStockFixture.movements },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border bg-card px-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StockMovementList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CoffeeHistory: Story = {};
export const OnePlace: Story = { args: { showPlace: false } };
export const Empty: Story = { args: { movements: [] } };
