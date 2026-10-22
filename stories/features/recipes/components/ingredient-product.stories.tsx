import type { Meta, StoryObj } from "@storybook/react-vite";
import { IngredientProductLink, IngredientShopLink, IngredientThumbnail } from "@/features/recipes/components/ingredient-product";
import { recipeFixture } from "../fixtures";

const cheese = recipeFixture.ingredients.find((item) => item.id === "ri-cheese")!.product!;
const withPhoto = { ...cheese, imageUrl: "https://images.example.be/emmental.jpg" };

function Links({ product }: { product: typeof cheese }) {
  return (
    <div className="flex max-w-sm items-center gap-3">
      <IngredientThumbnail product={product} />
      <IngredientProductLink product={product} className="min-w-0 flex-1 text-sm" />
      <IngredientShopLink product={product} />
    </div>
  );
}

const meta = {
  title: "Features/Recipes/Components/IngredientProduct",
  component: Links,
  args: { product: cheese },
} satisfies Meta<typeof Links>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Thumbnail (an icon without a photo), the product's name to its page, the webshop link (new tab). */
export const Default: Story = {};
export const WithPhoto: Story = { args: { product: withPhoto } };
/** No webshop link: no icon button. */
export const NoWebshop: Story = { args: { product: { ...cheese, shopLink: null } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
