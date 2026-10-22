import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaymentDetailsFields, type PaymentDetailsValues } from "@/features/expenses/components/payment-details-fields";

function Controlled(props: { initial: PaymentDetailsValues } & Omit<React.ComponentProps<typeof PaymentDetailsFields>, "values" | "onChange">) {
  const { initial, ...rest } = props;
  const [values, setValues] = React.useState(initial);
  return (
    <div className="flex w-[28rem] max-w-full flex-col gap-4">
      <PaymentDetailsFields {...rest} values={values} onChange={setValues} />
    </div>
  );
}

const meta = {
  title: "Features/Expenses/Components/PaymentDetailsFields",
  component: Controlled,
  args: { initial: { paymentMethod: null, beneficiaryName: "", iban: "", bic: "" } },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotSet: Story = {};
export const DirectDebit: Story = { args: { initial: { paymentMethod: "direct_debit", beneficiaryName: "", iban: "", bic: "" } } };
export const WireTransferWithOgm: Story = {
  args: {
    initial: { paymentMethod: "wire_transfer", beneficiaryName: "De Watergroep", iban: "BE68 5390 0754 7034", bic: "GKCCBEBB" },
    defaultStructuredCommunication: "123456789002",
  },
};
export const WireTransferFreeText: Story = {
  args: {
    initial: { paymentMethod: "wire_transfer", beneficiaryName: "", iban: "BE71 0961 2345 6769", bic: "" },
    defaultReference: "Invoice 2026-104",
  },
};
export const InvalidOgmAndIban: Story = {
  args: {
    initial: { paymentMethod: "wire_transfer", beneficiaryName: "", iban: "BE68 5390 0754 7035", bic: "" },
    defaultStructuredCommunication: "123456789003",
    errors: { iban: ["Invalid IBAN"], structuredCommunication: ["Invalid structured communication"] },
  },
};
