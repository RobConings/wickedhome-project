import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { CookingDoneDialog } from "@/features/recipes/components/cooking-done-dialog";
import { cookingStateFixture } from "../fixtures";

const open = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Done cooking" }));
};

const meta = {
  title: "Features/Recipes/Components/CookingDoneDialog",
  component: CookingDoneDialog,
  args: {
    entryId: "mp-spaghetti",
    recipeName: "Spaghetti bolognese",
    usages: cookingStateFixture.usages,
    trigger: <Button>Done cooking</Button>,
  },
  play: open,
} satisfies Meta<typeof CookingDoneDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What was used, per ingredient (the undone spaghetti tap is left out). */
export const Default: Story = {};
export const NothingUsed: Story = { args: { usages: [] } };
export const Loading: Story = {
  parameters: {
    router: { action: async () => new Promise<never>(() => undefined) },
  },
  play: async (context) => {
    await open(context);
    await userEvent.click(await screen.findByRole("button", { name: "Mark as made" }));
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
