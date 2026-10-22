import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductAlternatives } from "@/features/shopping/components/product-alternatives";
import { productFixtures, productListFixture, productSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductAlternatives",
  component: ProductAlternatives,
  args: {
    product: productFixtures.bacon,
    products: productListFixture,
    canManage: true,
    productHref: (id: string) => `/inventory/products/${id}`,
    initialSelections: productSelectionsFixture,
  },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductAlternatives>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A main product with two brands sharing its stock; "Link an alternative" opens the picker. */
export const Default: Story = {};
export const Highlighted: Story = { args: { highlightId: "pr-bacon-delhaize" } };
export const NoAlternatives: Story = { args: { product: productFixtures.coffee } };
/** An alternative itself: the main product it shares stock with. */
export const IsAlternative: Story = { args: { product: productFixtures.baconColruyt } };
export const AsChild: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
