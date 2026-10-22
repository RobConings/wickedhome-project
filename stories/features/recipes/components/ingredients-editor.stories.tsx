import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IngredientsEditor } from "@/features/recipes/components/ingredients-editor";
import { emptyIngredient, toDrafts, type IngredientDraft } from "@/features/recipes/components/ingredient-drafts";
import { productSelectionsFixture } from "../../shopping/fixtures";
import { recipeFixture, recipeProductsFixture, recipeShopsFixture } from "../fixtures";

function Editor({
  initial,
  ...props
}: Partial<React.ComponentProps<typeof IngredientsEditor>> & {
  initial: IngredientDraft[];
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <IngredientsEditor
      name="ingredients"
      value={value}
      onChange={setValue}
      products={recipeProductsFixture}
      shops={recipeShopsFixture}
      initialSelections={productSelectionsFixture}
      {...props}
    />
  );
}

const meta = {
  title: "Features/Recipes/Components/IngredientsEditor",
  component: Editor,
  args: { initial: toDrafts(recipeFixture.ingredients) },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof Editor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One card per ingredient: a product or just a name, amount and unit, the recipe's amount as a note, optional. */
export const Default: Story = {};
export const Empty: Story = { args: { initial: [emptyIngredient()] } };
/** The row's name is missing (the server's error shows under it). */
export const WithError: Story = {
  args: {
    initial: [emptyIngredient()],
    errorsFor: (name: string) => (name === "ingredients.0.name" ? ["Required"] : undefined),
  },
};
/** Saving: everything is locked. */
export const Loading: Story = { args: { disabled: true } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
