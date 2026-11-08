// Public API of the income feature (Finance, phase 2). Routes, the app frame and other features import from here only.
export { incomeAction, incomeLoader, type IncomePageData } from "./data/income-loaders";
export { IncomeScreen } from "./screens/income-screen";
export { VoucherBalances } from "./components/voucher-balances";
export { canManageIncome, type IncomeOverview, type VoucherBalance } from "./types/income";

export { incomeRecordLoader, incomeSourceLoader, incomeRecordAction } from "./data/income-loaders";
export { IncomeRecordScreen } from "./screens/income-record-screen";
export { IncomeSourceScreen } from "./screens/income-source-screen";
