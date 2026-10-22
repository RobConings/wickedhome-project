import type { Meta, StoryObj } from "@storybook/react-vite";
import { PayerField } from "@/features/expenses/components/payer-field";
import { expenseHabitants } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/PayerField",
  component: PayerField,
  decorators: [(Story) => <div className="w-[26rem] max-w-full">{Story()}</div>],
  args: { amountCents: 10000, habitants: expenseHabitants },
} satisfies Meta<typeof PayerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JointAccount: Story = {};
export const OnePerson: Story = { args: { defaultPayerType: "person", defaultHabitantId: "h2" } };
/** € 100,01 split equally: the leftover cent goes to the first person. */
export const SplitEqually: Story = { args: { amountCents: 10001, defaultPayerType: "split" } };
export const SplitByAmounts: Story = {
  args: {
    defaultPayerType: "split",
    defaultShares: [
      { habitantId: "h1", amountCents: 7000 },
      { habitantId: "h2", amountCents: 2000 },
    ],
  },
};
/** Paid with meal vouchers: no "Joint account"; a joint payer switches to the logged-in person (here Sofie). */
export const MealVouchers: Story = { args: { personOnly: true, meHabitantId: "h2" } };
export const WithError: Story = { args: { defaultPayerType: "split", error: "The shares must add up to the total amount." } };
