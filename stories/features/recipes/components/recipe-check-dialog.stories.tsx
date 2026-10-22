import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { RecipeCheckDialog } from "@/features/recipes/components/recipe-check-dialog";
import { failedCheck, fakeCheck, recipeFixture, stalledCheck } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/RecipeCheckDialog",
  component: RecipeCheckDialog,
  args: {
    recipe: recipeFixture,
    open: true,
    load: fakeCheck,
    trigger: <Button>Add to To cook</Button>,
  },
} satisfies Meta<typeof RecipeCheckDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Missing ingredients are ticked to buy; one is on the list already; basil has no product (stock unknown). */
export const Default: Story = {};
/** Waiting for the stock check. */
export const Loading: Story = { args: { load: stalledCheck } };
export const Failed: Story = { args: { load: failedCheck } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
