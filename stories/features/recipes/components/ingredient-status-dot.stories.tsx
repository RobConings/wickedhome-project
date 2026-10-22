import type { Meta, StoryObj } from "@storybook/react-vite";
import { IngredientStatusDot } from "@/features/recipes/components/ingredient-status-dot";

const meta = {
  title: "Features/Recipes/Components/IngredientStatusDot",
  component: IngredientStatusDot,
  args: { status: "in_stock" },
} satisfies Meta<typeof IngredientStatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Short: Story = { args: { status: "short" } };
/** No product linked, or the product isn't kept in stock. */
export const Unknown: Story = { args: { status: "unknown" } };
/** A product that isn't kept in stock. */
export const NotKept: Story = { args: { status: "not_kept" } };
/** The recipe's unit doesn't convert to the stock (no content per package, or "2 el"): a neutral ring. */
export const UnknownAmount: Story = { args: { status: "unknown_amount" } };
