import { api } from "@/lib/api-client";
import type { ExpenseAllocationView, ProjectAllocationInput } from "../types/project-allocation";
export const fetchExpenseAllocation = (id: string) => api.get<ExpenseAllocationView>(`/expenses/${encodeURIComponent(id)}/allocations`);
export const saveExpenseAllocation = (id: string, input: ProjectAllocationInput) => api.put<ExpenseAllocationView>(`/expenses/${encodeURIComponent(id)}/allocations`, input);
