import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { RecipeFormDialog } from "@/features/recipes/components/recipe-form-dialog";
import { recipeFixture, recipeProductsFixture, recipeShopsFixture } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/RecipeFormDialog",
  component: RecipeFormDialog,
  args: {
    trigger: <Button>New recipe</Button>,
    products: recipeProductsFixture,
    shops: recipeShopsFixture,
  },
} satisfies Meta<typeof RecipeFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Ingredients linked to products, steps as paragraphs; Delete in the footer. */
export const Edit: Story = {
  args: {
    recipe: recipeFixture,
    categories: [{ id: "cat-pasta", name: "Pasta", recipeCount: 0 }, { id: "cat-soup", name: "Soep", recipeCount: 0 }],
    trigger: <Button variant="outline">Edit Spaghetti</Button>,
  },
};
/** Saving takes a while: the fields are locked, Save spins and the dialog can't be closed until it's done. */
export const Loading: Story = {
  args: {
    recipe: recipeFixture,
    trigger: <Button variant="outline">Edit Spaghetti</Button>,
  },
  parameters: {
    router: { action: async () => new Promise<never>(() => undefined) },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit Spaghetti" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
export const Mobile: Story = {
  args: {
    recipe: recipeFixture,
    trigger: <Button variant="outline">Edit Spaghetti</Button>,
  },
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit Spaghetti" }));
  },
};
