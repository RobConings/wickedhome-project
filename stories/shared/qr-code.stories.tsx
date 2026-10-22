import type { Meta, StoryObj } from "@storybook/react-vite";
import { QrCode } from "@/components/shared/qr-code";

const meta = {
  title: "Shared/QrCode",
  component: QrCode,
  decorators: [(Story) => <div className="w-56">{Story()}</div>],
  args: { value: "https://home.example.be/invite/abc123", label: "QR code of the invite link" },
} satisfies Meta<typeof QrCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Link: Story = {};
/** A SEPA payment (EPC) payload, as banking apps scan it. */
export const Payment: Story = {
  args: {
    value: ["BCD", "002", "1", "SCT", "", "De Watergroep", "BE68539007547034", "EUR562.06", "", "123456789002"].join("\n"),
    label: "Payment QR code",
  },
};
