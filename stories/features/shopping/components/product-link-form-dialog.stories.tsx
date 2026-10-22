import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ProductLinkFormDialog } from "@/features/shopping/components/product-link-form-dialog";
import { productFixtures, shopListFixture, shopSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductLinkFormDialog",
  component: ProductLinkFormDialog,
  args: { product: productFixtures.nailGun, shops: shopListFixture, trigger: <Button>Add shop</Button>, initialSelections: shopSelectionsFixture },
} satisfies Meta<typeof ProductLinkFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddShop: Story = {};
export const EditGammaLink: Story = {
  args: { link: productFixtures.nailGun.shopLinks[0], trigger: <Button variant="outline">Edit Gamma</Button> },
};

/** Saving: the fields are locked, Save spins and the dialog stays open until the save is done. */
export const Saving: Story = {
  args: { link: productFixtures.nailGun.shopLinks[0], trigger: <Button variant="outline">Edit Gamma</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
