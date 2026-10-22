import type { Meta, StoryObj } from "@storybook/react-vite";
import { CookingScreen } from "@/features/recipes/screens/cooking-screen";
import { productSelectionsFixture } from "../../shopping/fixtures";
import { cookedStateFixture, cookingStateFixture, recipeProductsFixture } from "../fixtures";

const meta = {
  title: "Features/Recipes/Screens/CookingScreen",
  component: CookingScreen,
  parameters: { layout: "fullscreen" },
  args: {
    state: cookingStateFixture,
    products: recipeProductsFixture,
    canSaveToRecipe: true,
    initialSelections: productSelectionsFixture,
  },
} satisfies Meta<typeof CookingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Wide: the step with its timer, the ingredients next to it. */
export const Default: Story = {};
/** Reloading after a tap: "Saving…" in the header, the step stays put. */
export const Loading: Story = { args: { pending: true } };
export const Made: Story = { args: { state: cookedStateFixture } };
/** Phone (375 px): one large step, the ingredients in the tray at the bottom. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
