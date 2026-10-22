import type { Meta, StoryObj } from "@storybook/react-vite";
import { MealPlanCard } from "@/features/recipes/components/meal-plan-card";
import { mealPlanFixtures } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/MealPlanCard",
  component: MealPlanCard,
  args: { entry: mealPlanFixtures.open, canManage: true },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof MealPlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Waiting, with three items still to buy. */
export const Default: Story = {};
/** Being cooked: "Continue cooking" and the step it's at. */
export const Cooking: Story = { args: { entry: mealPlanFixtures.cooking } };
export const Made: Story = { args: { entry: mealPlanFixtures.cooked } };
/** Children cook and mark done, but don't take meals off the list. */
export const AsChild: Story = { args: { canManage: false } };
/** Starting takes a while: the button spins. */
export const Loading: Story = {
  parameters: {
    router: { action: async () => new Promise<never>(() => undefined) },
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
