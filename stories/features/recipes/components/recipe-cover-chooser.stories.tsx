import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipeCoverChooser } from "@/features/recipes/components/recipe-cover-chooser";

const images = [
  { id: "f-photo-1", name: "bolognese.jpg", mimeType: "image/jpeg" },
  { id: "f-photo-2", name: "bord.jpg", mimeType: "image/jpeg" },
];

const meta = {
  title: "Features/Recipes/Components/RecipeCoverChooser",
  component: RecipeCoverChooser,
  args: {
    recipeId: "r-spaghetti",
    coverFileId: "f-photo-1",
    canManage: true,
    initialImages: images,
  },
} satisfies Meta<typeof RecipeCoverChooser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoImages: Story = {
  args: { initialImages: [], coverFileId: null },
};
/** Loading the attached images. */
export const Loading: Story = {
  args: { initialImages: undefined, recipeId: "r-loading" },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
