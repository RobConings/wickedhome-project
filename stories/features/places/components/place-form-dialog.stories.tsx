import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { PlaceFormDialog } from "@/features/places/components/place-form-dialog";
import { floorFixtures, placeFixtures } from "../fixtures";

const meta = {
  title: "Features/Places/Components/PlaceFormDialog",
  component: PlaceFormDialog,
  args: { floors: Object.values(floorFixtures), trigger: <Button>Add place</Button> },
} satisfies Meta<typeof PlaceFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const CreateOutside: Story = { args: { defaultFloorId: floorFixtures.outside.id } };
export const Edit: Story = { args: { place: placeFixtures.kitchen, trigger: <Button variant="outline">Edit kitchen</Button> } };
export const ValidationErrors: Story = {
  parameters: {
    router: { action: async () => ({ intent: "create-place", errors: { name: ["Too small: expected string to have >=1 characters"] } }) },
  },
};

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  args: { place: placeFixtures.kitchen, trigger: <Button variant="outline">Edit kitchen</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit kitchen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
