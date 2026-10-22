import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { AddExtraDialog } from "@/features/recipes/components/add-extra-dialog";
import { productSelectionsFixture } from "../../shopping/fixtures";
import { recipeProductsFixture } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/AddExtraDialog",
  component: AddExtraDialog,
  args: {
    entryId: "mp-spaghetti",
    products: recipeProductsFixture,
    canSaveToRecipe: true,
    trigger: <Button>+ Ingredient</Button>,
    initialSelections: productSelectionsFixture,
  },
} satisfies Meta<typeof AddExtraDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Children can't change the recipe: no "Also add to the recipe". */
export const AsChild: Story = { args: { canSaveToRecipe: false } };
export const Loading: Story = {
  parameters: {
    router: { action: async () => new Promise<never>(() => undefined) },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "+ Ingredient" }));
    await userEvent.type(await screen.findByLabelText(/^Name/), "Look");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "+ Ingredient" }));
  },
};
