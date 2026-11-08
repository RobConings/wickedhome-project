import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeSourceScreen } from "@/features/income/screens/income-source-screen";
import { incomeHabitants, incomeOverviewFixture, sourceFixtures } from "../fixtures";
const source = sourceFixtures.robSalary;
const detail = { source, month: incomeOverviewFixture.month, occurrences: incomeOverviewFixture.occurrences.filter((row) => row.sourceId === source.id), history: { items: incomeOverviewFixture.incomes.filter((row) => row.sourceId === source.id), total: 1, page: 1, pageSize: 25 } };
const meta = {
  title: "Features/Income/Screens/IncomeSourceScreen", component: IncomeSourceScreen,
  parameters: { layout: "fullscreen" },
  args: { detail, overview: incomeOverviewFixture, habitants: incomeHabitants, canManage: true },
} satisfies Meta<typeof IncomeSourceScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Empty: Story = { args: { detail: { ...detail, occurrences: [], history: { items: [], total: 0, page: 1, pageSize: 25 } } } };
export const Variable: Story = { args: { detail: { ...detail, source: sourceFixtures.robVouchers } } };
