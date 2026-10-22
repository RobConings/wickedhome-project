import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { FloorFormDialog } from "@/features/places/components/floor-form-dialog";
import { floorFixtures } from "../fixtures";

const meta = {
  title: "Features/Places/Components/FloorFormDialog",
  component: FloorFormDialog,
  args: { trigger: <Button>Add floor</Button> },
} satisfies Meta<typeof FloorFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const CreateOutside: Story = { args: { defaultKind: "outdoor", trigger: <Button>Add the outside plan</Button> } };
export const Edit: Story = { args: { floor: floorFixtures.first, trigger: <Button variant="outline">Edit first floor</Button> } };
export const ValidationErrors: Story = {
  parameters: {
    router: { action: async () => ({ intent: "create-floor", errors: { name: ["Too small: expected string to have >=1 characters"] } }) },
  },
};

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  args: { floor: floorFixtures.first, trigger: <Button variant="outline">Edit first floor</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit first floor" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
