import { api } from "@/lib/api-client";
import type {
  Income,
  IncomeInput,
  IncomeOverview,
  IncomeSource,
  IncomeSourceCreateInput,
  IncomeSourceUpdateInput,
} from "../types/income";

const sourcePath = (id: string) => `/income/sources/${encodeURIComponent(id)}`;
const incomePath = (id: string) => `/income/incomes/${encodeURIComponent(id)}`;

export const fetchIncomeOverview = (month?: string | null) =>
  api.get<IncomeOverview>(month ? `/income?month=${encodeURIComponent(month)}` : "/income");

export const createIncomeSource = (input: IncomeSourceCreateInput) => api.post<IncomeSource>("/income/sources", input);
export const updateIncomeSource = (id: string, input: IncomeSourceUpdateInput) => api.put<IncomeSource>(sourcePath(id), input);
export const deleteIncomeSource = (id: string) => api.delete(sourcePath(id));
export const deleteIncomeAmount = (id: string, amountId: string) =>
  api.delete<IncomeSource>(`${sourcePath(id)}/amounts/${encodeURIComponent(amountId)}`);

export const createIncome = (input: IncomeInput) => api.post<Income>("/income/incomes", input);
export const updateIncome = (id: string, input: IncomeInput) => api.put<Income>(incomePath(id), input);
export const deleteIncome = (id: string) => api.delete(incomePath(id));
