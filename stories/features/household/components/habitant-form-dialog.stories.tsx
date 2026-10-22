import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { habitantFixtures } from "../fixtures";
import { HabitantFormDialog } from "@/features/household/components/habitant-form-dialog";

const meta = {
  title: "Features/Household/Components/HabitantFormDialog",
  component: HabitantFormDialog,
  args: { trigger: <Button>Add habitant</Button> },
} satisfies Meta<typeof HabitantFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { habitant: habitantFixtures.child, trigger: <Button variant="outline">Edit Lena</Button> } };
/** The browser checks the form with the schema first: Save with an empty name. */
export const ClientValidation: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add habitant" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};

/** The action answered with field errors: they show under the fields and the dialog stays open. */
export const ValidationErrors: Story = {
  parameters: {
    router: { action: async () => ({ intent: "create", errors: { name: ["This name is already used."] } }) },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add habitant" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Lena");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add habitant" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Rob");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};
