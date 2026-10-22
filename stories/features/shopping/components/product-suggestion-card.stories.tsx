import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductSuggestionCard } from "@/features/shopping/components/product-suggestion-card";
import { suggestionFixtures } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductSuggestionCard",
  component: ProductSuggestionCard,
  args: { suggestion: suggestionFixtures.cola },
} satisfies Meta<typeof ProductSuggestionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Large, as on the scan screen: readable at arm's length. */
export const WithPhoto: Story = {};
export const WithoutPhoto: Story = { args: { suggestion: suggestionFixtures.dishSoap } };
/** Medium, as inside the product form. */
export const InForm: Story = { args: { size: "md" } };
/** The photo couldn't be loaded: the category icon shows instead. */
export const BrokenPhoto: Story = { args: { suggestion: { ...suggestionFixtures.cola, imageUrl: "/does-not-exist.jpg" } } };
