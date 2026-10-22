import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProductPicker } from "@/features/shopping/components/product-picker";
import { productListFixture, productSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductPicker",
  component: ProductPicker,
  args: { products: productListFixture, name: "productId", onChange: fn(), initialSelections: productSelectionsFixture },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFavoritesAndRecents: Story = {};
export const Selected: Story = { args: { defaultValue: "pr-nail-gun", clearable: true } };
export const NoHistory: Story = { args: { initialSelections: { favoriteIds: [], recentIds: [] } } };
