import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlaceStockSection } from "@/features/inventory/components/place-stock-section";
import { failApi, stallApi } from "../../shopping/fixtures";
import { stockFixtures } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/PlaceStockSection",
  component: PlaceStockSection,
  args: { placeId: "p-pantry", initialItems: [stockFixtures.tablets, stockFixtures.coffee, stockFixtures.pasta] },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaceStockSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pantry: Story = {};
export const Garage: Story = { args: { placeId: "p-garage", initialItems: [stockFixtures.screws, stockFixtures.sheeting] } };
export const Empty: Story = { args: { initialItems: [] } };

/** First load: placeholder rows shaped like the list. */
export const Loading: Story = { args: { initialItems: undefined }, beforeEach: stallApi };
/** The first load failed: an error with "Try again" instead of "nothing in stock". */
export const LoadFailed: Story = { args: { initialItems: undefined }, beforeEach: failApi };
