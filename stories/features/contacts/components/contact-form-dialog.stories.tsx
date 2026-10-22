import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ContactFormDialog } from "@/features/contacts/components/contact-form-dialog";
import { contactFixtures, contactShopsFixture } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ContactFormDialog",
  component: ContactFormDialog,
  args: { trigger: <Button>Add contact</Button>, shops: contactShopsFixture, knownTrades: ["aannemer", "loodgieter"] },
} satisfies Meta<typeof ContactFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
/** Several numbers and addresses, a website and notes; Delete in the footer warns about the linked project. */
export const Edit: Story = {
  args: { contact: contactFixtures.peeters, trigger: <Button variant="outline">Edit Jan Peeters</Button> },
};
export const EditSupplierWithShop: Story = {
  args: { contact: contactFixtures.tiles, trigger: <Button variant="outline">Edit supplier</Button> },
};
/** From a project's page: the new contact is linked to the project right away. */
export const CreateForProject: Story = { args: { projectId: "pr-bathroom", defaultTrade: "aannemer" } };
/** Saving takes a while: the fields are locked, Save spins and the dialog can't be closed until it's done. */
export const Saving: Story = {
  args: { contact: contactFixtures.spark, trigger: <Button variant="outline">Edit Els</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit Els" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
/** The browser checks the form first: an empty name and a phone number that isn't one. */
export const ClientValidation: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add contact" }));
    await userEvent.type(await screen.findByLabelText(/Phone numbers/), "call me");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};
export const Mobile: Story = {
  args: { contact: contactFixtures.peeters, trigger: <Button variant="outline">Edit Jan Peeters</Button> },
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit Jan Peeters" }));
  },
};
