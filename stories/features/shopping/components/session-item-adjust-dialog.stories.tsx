import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionItemAdjustDialog } from "@/features/shopping/components/session-item-adjust-dialog";
import { productFixtures } from "../fixtures";

const product = productFixtures.milk;
const meta = {
  title: "Features/Shopping/Components/SessionItemAdjustDialog",
  component: SessionItemAdjustDialog,
  args: {
    open: true, onOpenChange: () => undefined,
    item: { id: "visit-milk", productId: product.id, name: product.name, category: product.category, quantity: 2, purchasedQuantity: 0, unit: "l", status: "open", revision: 1, stockItemId: null, requirementIds: [], stockNeed: null, stockStatus: null, isEssential: true },
    products: [product, { ...product, id: "other-milk", name: "Other linked milk brand", stockProductId: product.id }],
    initialSelections: { favoriteIds: [], recentIds: [] },
  },
} satisfies Meta<typeof SessionItemAdjustDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const QuantityOnly: Story = { args: { products: [product] } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
