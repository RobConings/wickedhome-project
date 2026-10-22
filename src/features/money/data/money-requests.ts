import { api } from "@/lib/api-client";
import type {
  AccountCreateInput,
  AccountUpdateInput,
  ContributionPlan,
  ContributionPlanInput,
  DirectPaymentInput,
  JointAccount,
  KeepExtraInput,
  MoneyLoans,
  MoneyMonth,
  MoneySummary,
  MoneyTimeline,
  OtherEntryInput,
  PlanAmountsInput,
  RecordTransferInput,
  SetBalanceInput,
  TakeBackInput,
} from "../types/money";

const accountPath = (id: string) => `/money/accounts/${encodeURIComponent(id)}`;
const planPath = (id: string) => `/money/plans/${encodeURIComponent(id)}`;

export const fetchMoneyMonth = (month?: string | null) => api.get<MoneyMonth>(month ? `/money?month=${encodeURIComponent(month)}` : "/money");
export const fetchMoneySummary = () => api.get<MoneySummary>("/money/summary");
export const fetchMoneyLoans = () => api.get<MoneyLoans>("/money/loans");
/** Default range: 12 months back to 24 ahead (`YYYY-MM` bounds otherwise). */
export const fetchMoneyTimeline = (range?: { from: string; to: string }) =>
  api.get<MoneyTimeline>(range ? `/money/timeline?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : "/money/timeline");

export const createAccount = (input: AccountCreateInput) => api.post<JointAccount>("/money/accounts", input);
export const updateAccount = (id: string, input: AccountUpdateInput) => api.put<JointAccount>(accountPath(id), input);
export const setAccountBalance = (id: string, input: SetBalanceInput) => api.post(`${accountPath(id)}/balance`, input);
export const addOtherEntry = (id: string, input: OtherEntryInput) => api.post(`${accountPath(id)}/entries`, input);
export const recordTransfer = (input: RecordTransferInput) => api.post("/money/transfers", input);
export const deleteEntry = (id: string) => api.delete(`/money/entries/${encodeURIComponent(id)}`);

export const takeBackContribution = (input: TakeBackInput) => api.post("/money/contributions/take-back", input);
export const setKeptExtra = (input: KeepExtraInput) => api.put("/money/contributions/extra", input);
export const recordDirectPayment = (input: DirectPaymentInput) => api.post("/money/contributions/direct", input);
export const setPlanAmounts = (input: PlanAmountsInput) => api.post("/money/plans/amounts", input);

export const createPlan =(input: ContributionPlanInput) => api.post<ContributionPlan>("/money/plans", input);
export const updatePlan = (id: string, input: ContributionPlanInput) => api.put<ContributionPlan>(planPath(id), input);
export const deletePlan = (id: string) => api.delete(planPath(id));
