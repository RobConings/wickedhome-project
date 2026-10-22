import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ShoppingListFormDialog } from "@/features/shopping/components/shopping-list-form-dialog";
import { listFixtures } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ShoppingListFormDialog",
  component: ShoppingListFormDialog,
  args: { trigger: <Button>New list</Button> },
} satisfies Meta<typeof ShoppingListFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { list: listFixtures.pharmacy, trigger: <Button variant="outline">Edit list</Button> } };

/** Save without a name: the form checks it in the browser and shows the error under the field. */
export const NameMissing: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};

/** Saving: the fields are locked, Save spins and the dialog stays open until the save is done. */
export const Saving: Story = {
  args: { list: listFixtures.pharmacy, trigger: <Button variant="outline">Edit list</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
