import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProductActions } from "@/features/shopping/components/product-actions";
import { productFixtures, shopListFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductActions",
  component: ProductActions,
  args: {
    product: productFixtures.coffee,
    shops: shopListFixture,
    onDelete: fn(async () => undefined),
  },
} satisfies Meta<typeof ProductActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Edit opens the product form; delete asks first. */
export const Default: Story = {};
