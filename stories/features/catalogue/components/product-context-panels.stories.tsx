import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductContextPanels } from "@/features/catalogue/components/product-context-panels";

const meta = { title: "Features/Catalogue/Components/ProductContextPanels", component: ProductContextPanels, args: { productId: "milk", initial: { productId: "milk", recipes: [{ id: "pancakes", name: "Family pancakes", imageUrl: null }], needs: [{ id: "need", name: "Milk", quantity: 2, unit: "carton", listIds: ["groceries"] }], tasks: [{ id: "task", name: "Prepare breakfast", status: "open" }], projects: [{ id: "project", name: "Family weekend", imageUrl: null }] } } } satisfies Meta<typeof ProductContextPanels>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

