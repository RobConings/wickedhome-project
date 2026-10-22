import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";

const meta = {
  title: "Shared/MoneyInput",
  component: MoneyInput,
  args: { id: "amount", placeholder: "0,00", className: "w-56" },
} satisfies Meta<typeof MoneyInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithValue: Story = { args: { defaultValueCents: 123456 } };

/** Type "12,50", "1.234,56" or "12.50": the form receives integer cents. */
export const ShowsCents: Story = {
  render: (args) => {
    const [cents, setCents] = React.useState<number | null>(8950);
    return (
      <FormField label="Amount" htmlFor="amount" description={`Stored as: ${cents ?? "invalid"} cents`}>
        <MoneyInput {...args} defaultValueCents={8950} onValueChange={setCents} />
      </FormField>
    );
  },
};

export const Invalid: Story = {
  render: (args) => (
    <FormField label="Amount" htmlFor="amount" errors={["Enter an amount like 12,50"]}>
      <MoneyInput {...args} />
    </FormField>
  ),
};
