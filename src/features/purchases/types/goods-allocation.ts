import { z } from "zod";
import { idSchema } from "@/types/common";
const quantity = z.number().min(0).max(100_000).multipleOf(0.001);
export const goodsAllocationInputSchema = z.object({
  revision: z.number().int().min(0), householdQuantity: quantity,
  projects: z.array(z.object({ projectId: idSchema, quantity: quantity.min(0.001) })).max(50),
}).refine((value) => new Set(value.projects.map((part) => part.projectId)).size === value.projects.length, { path: ["projects"], message: "Choose each project once" });
export type GoodsAllocationInput = z.infer<typeof goodsAllocationInputSchema>;
export type GoodsAllocationView = {
  acquisitionId: string; revision: number; quantity: number; unit: string | null; explicit: boolean;
  householdQuantity: number; unallocatedQuantity: number;
  projects: { projectId: string | null; name: string; quantity: number }[];
};
export const goodsAllocationFormSchema = z.object({
  revision: z.coerce.number().int().min(0), householdQuantity: z.coerce.number().min(0).max(100_000).multipleOf(0.001),
  projects: z.preprocess((value) => { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return undefined; } }, goodsAllocationInputSchema.shape.projects),
});
