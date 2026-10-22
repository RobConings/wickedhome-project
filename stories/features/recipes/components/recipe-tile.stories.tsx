import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipeListItem, RecipeTile } from "@/features/recipes/components/recipe-tile";
import { recipeListFixture } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/RecipeTile",
  component: RecipeTile,
  args: {
    recipe: recipeListFixture[2]!,
    isFavorite: true,
    onToggleFavorite: () => undefined,
  },
  decorators: [(Story) => <div className="max-w-xs">{Story()}</div>],
} satisfies Meta<typeof RecipeTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Without servings or steps, only the ingredients count shows. */
export const Sparse: Story = {
  args: { recipe: recipeListFixture[3]!, isFavorite: false },
};
export const ListRow: Story = {
  render: (args) => <RecipeListItem {...args} />,
};
export const LongName: Story = {
  args: {
    recipe: {
      ...recipeListFixture[0]!,
      name: "Oma's beroemde stoofvlees met Westmalle, mosterd en peperkoek, op zijn Vlaams",
    },
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
