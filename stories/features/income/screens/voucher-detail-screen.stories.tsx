import type { Meta, StoryObj } from "@storybook/react-vite";
import { VoucherDetailScreen } from "@/features/income/screens/voucher-detail-screen";
import { voucherBalances, voucherExpiry } from "@/features/income/types/income-calculations";
import type { Income, VoucherDetail } from "@/features/income/types/income";
import { incomeHabitants, incomeToday } from "../fixtures";

const person = incomeHabitants[0]!;
const credits: Income[] = [{ id: "voucher-credit", habitantId: person.id, date: "2026-10-01", kind: "meal_vouchers", amountCents: 16000, description: "Maaltijdcheques oktober", sourceId: null, periodDate: null, targetAccountId: null, note: null }];
const spending = [{ expenseId: "voucher-groceries", payee: "Boodschappen", habitantId: person.id, date: incomeToday, amountCents: 2500 }];
const detail: VoucherDetail = { today: incomeToday, person, balance: voucherBalances(credits, spending, incomeToday)[0]!,
  receipts: { items: credits.map((credit) => ({ ...credit, expiresOn: voucherExpiry(credit.date) })), total: 1, page: 1, pageSize: 25 },
  spending: { items: spending, total: 1, page: 1, pageSize: 25 } };
const meta = { title: "Features/Income/Screens/VoucherDetailScreen", component: VoucherDetailScreen, parameters: { layout: "fullscreen", router: { initialEntries: [`/income/vouchers/${person.id}`] } }, args: { detail } } satisfies Meta<typeof VoucherDetailScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { detail: { ...detail, balance: { habitantId: person.id, receivedCents: 0, spentCents: 0, availableCents: 0, expiredCents: 0, uncoveredCents: 0, balanceCents: 0, nextExpiry: null, expiringSoon: null }, receipts: { ...detail.receipts, items: [], total: 0 }, spending: { ...detail.spending, items: [], total: 0 } } } };
export const UncoveredSpending: Story = { args: { detail: { ...detail, balance: voucherBalances(credits, [{ ...spending[0]!, amountCents: 20000 }], incomeToday)[0]!, spending: { ...detail.spending, items: [{ ...spending[0]!, amountCents: 20000 }] } } } };
