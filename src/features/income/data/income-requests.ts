import { api, resourcePath, restResource, withQuery } from "@/lib/api-client";
import type {
  Income,
  IncomeInput,
  IncomeOverview,
  IncomeSource,
  IncomeSourceCreateInput,
  IncomeSourceUpdateInput,
} from "../types/income";

const sourcePath = resourcePath("/income/sources");
const incomes = restResource<Income, IncomeInput>("/income/incomes");

export const fetchIncomeOverview = (month?: string | null) =>
  api.get<IncomeOverview>(withQuery("/income", { month }));

export const createIncomeSource = (input: IncomeSourceCreateInput) => api.post<IncomeSource>("/income/sources", input);
export const updateIncomeSource = (id: string, input: IncomeSourceUpdateInput) => api.put<IncomeSource>(sourcePath(id), input);
export const deleteIncomeSource = (id: string) => api.delete(sourcePath(id));
export const deleteIncomeAmount = (id: string, amountId: string) =>
  api.delete<IncomeSource>(sourcePath(id, "amounts", amountId));

export const createIncome = incomes.create;
export const updateIncome = incomes.update;
export const deleteIncome = incomes.remove;
