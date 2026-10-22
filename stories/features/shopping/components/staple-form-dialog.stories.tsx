import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { StapleFormDialog } from "@/features/shopping/components/staple-form-dialog";
import { productListFixture, productSelectionsFixture, shopListFixture, shopSelectionsFixture, shoppingOverviewFixture, stapleFixtures } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/StapleFormDialog",
  component: StapleFormDialog,
  args: {
    lists: shoppingOverviewFixture.lists,
    products: productListFixture,
    shops: shopListFixture,
    defaultListId: "l-weekly",
    trigger: <Button>Add staple</Button>,
    initialSelections: { products: productSelectionsFixture, shops: shopSelectionsFixture },
  },
} satisfies Meta<typeof StapleFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const EditEveryTwoWeeks: Story = { args: { staple: stapleFixtures[2], trigger: <Button variant="outline">Edit eggs</Button> } };

/** Saving: the fields are locked, Save spins and the dialog stays open until the save is done. */
export const Saving: Story = {
  args: { staple: stapleFixtures[2], trigger: <Button variant="outline">Edit eggs</Button> },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
