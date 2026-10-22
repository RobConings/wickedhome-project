import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ShopFormDialog } from "@/features/shops/components/shop-form-dialog";
import { shopFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopFormDialog",
  component: ShopFormDialog,
  args: { trigger: <Button>Add shop</Button> },
} satisfies Meta<typeof ShopFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const EditOwn: Story = {
  args: { shop: shopFixtures.bakery, trigger: <Button variant="outline">Edit bakery</Button> },
};
export const EditBuiltIn: Story = {
  args: { shop: shopFixtures.colruyt, trigger: <Button variant="outline">Edit Colruyt</Button> },
};
/** A shop with a webshop and a website: "Use for ingredient search" shows (and hides when the webshop is switched off). */
export const EditWebshop: Story = {
  args: { shop: shopFixtures.delhaize, trigger: <Button variant="outline">Edit Delhaize</Button> },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit Delhaize" }));
  },
};
export const Mobile: Story = {
  args: { shop: shopFixtures.delhaize, trigger: <Button variant="outline">Edit Delhaize</Button> },
  globals: { viewport: { value: "mobile1" } },
};
/** Saving takes a while: the fields are locked, Save spins and the dialog can't be closed until it's done. */
export const Saving: Story = {
  args: { shop: shopFixtures.bakery, trigger: <Button variant="outline">Edit bakery</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit bakery" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
/** The action answered with field errors: they show under the fields and the dialog stays open. */
export const ValidationErrors: Story = {
  parameters: {
    router: {
      action: async () => ({
        intent: "create",
        errors: { name: ["A shop with this name already exists."], websiteUrl: ["Invalid URL"] },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add shop" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Bakkerij Peeters");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  },
};

/** The browser checks the form with the schema first: Save with an empty name. */
export const ClientValidation: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add shop" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
