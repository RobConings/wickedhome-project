import { z } from "zod";
import { idSchema } from "@/types/common";

export const projectAllocationInputSchema = z.object({
  revision: z.iso.datetime().describe("Expense updatedAt from its current allocation view; reread after a conflict"),
  householdCents: z.number().int().min(0).max(100_000_000),
  projects: z.array(z.object({ projectId: idSchema, amountCents: z.number().int().min(1).max(100_000_000) })).max(50),
}).refine((input) => new Set(input.projects.map((row) => row.projectId)).size === input.projects.length, { path: ["projects"], message: "Choose each project once" });
export type ProjectAllocationInput = z.infer<typeof projectAllocationInputSchema>;
export type ExpenseAllocationView = {
  expenseId: string; totalCents: number; revision: string; explicit: boolean;
  householdCents: number; unallocatedCents: number;
  projects: { projectId: string | null; name: string; amountCents: number }[];
};

export const projectAllocationFormSchema = z.object({
  revision: z.iso.datetime(), householdCents: z.coerce.number().int().min(0).max(100_000_000),
  projects: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return undefined; }
  }, projectAllocationInputSchema.shape.projects),
});
