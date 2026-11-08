import type { Meta, StoryObj } from "@storybook/react-vite";
import { PurchasesScreen } from "@/features/purchases/screens/purchases-screen";
import { purchaseFixture } from "../fixtures";
const meta = { title: "Features/Purchases/Screens/PurchasesScreen", component: PurchasesScreen, parameters: { layout: "fullscreen" }, args: { purchases: [purchaseFixture] } } satisfies Meta<typeof PurchasesScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Empty: Story = { args: { purchases: [] } };
