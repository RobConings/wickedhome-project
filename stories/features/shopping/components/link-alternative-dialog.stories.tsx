import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { LinkAlternativeDialog } from "@/features/shopping/components/link-alternative-dialog";
import { productFixtures, productListFixture, productSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/LinkAlternativeDialog",
  component: LinkAlternativeDialog,
  args: {
    product: productFixtures.bacon,
    products: productListFixture,
    initialSelections: productSelectionsFixture,
    trigger: <Button variant="outline">Link an alternative</Button>,
  },
} satisfies Meta<typeof LinkAlternativeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** From a product page: the chosen product becomes an alternative (products of the group are left out). */
export const Default: Story = { args: { open: true } };
/** From the scan screen: the product that was just added is an alternative for the chosen one. */
export const AlternativeOf: Story = { args: { product: productFixtures.milk, mode: "of", open: true } };
export const Mobile: Story = { args: { open: true }, globals: { viewport: { value: "mobile1" } } };
