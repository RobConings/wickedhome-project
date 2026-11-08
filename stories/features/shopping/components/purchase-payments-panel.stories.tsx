import type { Meta, StoryObj } from "@storybook/react-vite";
import { PurchasePaymentsPanel } from "@/features/shopping/components/purchase-payments-panel";
import { sessionFixture, paymentOptionsFixture } from "../session-fixtures";
const meta = { title: "Features/Shopping/Components/PurchasePaymentsPanel", component: PurchasePaymentsPanel,
  args: { sessionId: "session", purchaseId: "purchase", initial: sessionFixture, initialOptions: paymentOptionsFixture },
} satisfies Meta<typeof PurchasePaymentsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
