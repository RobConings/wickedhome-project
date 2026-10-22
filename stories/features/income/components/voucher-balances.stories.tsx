import type { Meta, StoryObj } from "@storybook/react-vite";
import { VoucherBalances } from "@/features/income/components/voucher-balances";
import { expiringVoucherBalancesFixture, incomeHabitants, incomeOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Income/Components/VoucherBalances",
  component: VoucherBalances,
  args: { balances: incomeOverviewFixture.vouchers, habitants: incomeHabitants },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof VoucherBalances>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Available vouchers and when the next part expires; spending without valid vouchers shows in red. */
export const Default: Story = {};
/** Rob's oldest vouchers expire within 30 days (warning on top); Sofie's 2025 vouchers expired unused. */
export const ExpiringSoon: Story = { args: { balances: expiringVoucherBalancesFixture } };
export const NoVouchers: Story = { args: { balances: [] } };
