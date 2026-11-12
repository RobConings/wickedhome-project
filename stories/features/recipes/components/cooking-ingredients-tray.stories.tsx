import type { Meta, StoryObj } from "@storybook/react-vite";
import { CookingIngredientsTray } from "@/features/recipes/components/cooking-ingredients-tray";
import { Text } from "@/components/ui/text";
const meta = { title: "Features/Recipes/Components/CookingIngredientsTray", component: CookingIngredientsTray,
  parameters: { layout: "fullscreen" }, args: { title: "Ingredients", label: "2 of 5 ingredients used", children: <Text>Milk, eggs and flour</Text> },
} satisfies Meta<typeof CookingIngredientsTray>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = {};
