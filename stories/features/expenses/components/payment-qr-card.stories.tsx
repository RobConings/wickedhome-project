import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaymentQrCard } from "@/features/expenses/components/payment-qr-card";
import { expenseFixtures } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/PaymentQrCard",
  component: PaymentQrCard,
  decorators: [(Story) => <div className="w-[22rem] max-w-full">{Story()}</div>],
  args: { expense: expenseFixtures.watergroep },
} satisfies Meta<typeof PaymentQrCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Structured communication (OGM) in the QR's creditor reference. */
export const WithOgm: Story = {};
/** Free-text communication in the remittance field. */
export const WithFreeReference: Story = { args: { expense: expenseFixtures.hendrickx } };
/** On a phone: "Open in banking app" (share sheet) or "Save image", and "Copy all", full width. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
/** No IBAN: says what's missing. */
export const MissingIban: Story = { args: { expense: { ...expenseFixtures.watergroep, iban: null } } };
