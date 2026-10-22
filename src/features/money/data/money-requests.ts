import { api, resourcePath, restResource, withQuery } from "@/lib/api-client";
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

const accountPath = resourcePath("/money/accounts");
const plans = restResource<ContributionPlan, ContributionPlanInput>("/money/plans");

export const fetchMoneyMonth = (month?: string | null) => api.get<MoneyMonth>(withQuery("/money", { month }));
export const fetchMoneySummary = () => api.get<MoneySummary>("/money/summary");
export const fetchMoneyLoans = () => api.get<MoneyLoans>("/money/loans");
/** Default range: 12 months back to 24 ahead (`YYYY-MM` bounds otherwise). */
export const fetchMoneyTimeline = (range?: { from: string; to: string }) =>
  api.get<MoneyTimeline>(withQuery("/money/timeline", { from: range?.from, to: range?.to }));

export const createAccount = (input: AccountCreateInput) => api.post<JointAccount>("/money/accounts", input);
export const updateAccount = (id: string, input: AccountUpdateInput) => api.put<JointAccount>(accountPath(id), input);
export const setAccountBalance = (id: string, input: SetBalanceInput) => api.post(accountPath(id, "balance"), input);
export const addOtherEntry = (id: string, input: OtherEntryInput) => api.post(accountPath(id, "entries"), input);
export const recordTransfer = (input: RecordTransferInput) => api.post("/money/transfers", input);
export const deleteEntry = (id: string) => api.delete(resourcePath("/money/entries")(id));

export const takeBackContribution = (input: TakeBackInput) => api.post("/money/contributions/take-back", input);
export const setKeptExtra = (input: KeepExtraInput) => api.put("/money/contributions/extra", input);
export const recordDirectPayment = (input: DirectPaymentInput) => api.post("/money/contributions/direct", input);
export const setPlanAmounts = (input: PlanAmountsInput) => api.post("/money/plans/amounts", input);

export const createPlan = plans.create;
export const updatePlan = plans.update;
export const deletePlan = plans.remove;
