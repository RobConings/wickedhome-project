import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { StockItemFormDialog } from "@/features/inventory/components/stock-item-form-dialog";
import { productSelectionsFixture } from "../../shopping/fixtures";
import { inventoryPageFixture, placeSelectionsFixture, stockFixtures } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/StockItemFormDialog",
  component: StockItemFormDialog,
  args: {
    products: inventoryPageFixture.products,
    places: inventoryPageFixture.places,
    trigger: <Button>Add stock</Button>,
    initialSelections: { products: productSelectionsFixture, places: placeSelectionsFixture },
  },
} satisfies Meta<typeof StockItemFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const CreateForProduct: Story = { args: { defaults: { productId: "pr-screws", placeId: "p-garage" } } };
export const Edit: Story = { args: { stockItem: stockFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> } };

/** Saving: the fields are locked, Save spins and the dialog stays open until the save is done. */
export const Saving: Story = {
  args: { stockItem: stockFixtures.coffee, trigger: <Button variant="outline">Edit coffee</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
