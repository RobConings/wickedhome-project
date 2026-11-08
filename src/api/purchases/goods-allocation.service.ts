import { goodsAllocationInputSchema, type GoodsAllocationInput, type GoodsAllocationView } from "@/features/purchases/types/goods-allocation";
import { db, type Prisma } from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";
import { publish } from "../lib/events";

export const goodsAllocationInclude = { projectAllocations: { include: { project: { select: { name: true } } } } } as const;
type Row = Prisma.StockPurchaseGetPayload<{ include: typeof goodsAllocationInclude }>;
const milli = (value: number) => Math.round(value * 1000);
export function goodsAllocationView(row: Row): GoodsAllocationView {
  const quantity = row.purchasedQuantity?.toNumber() ?? row.quantity.toNumber();
  const householdQuantity = row.allocationHouseholdQuantity?.toNumber() ?? 0;
  const projects = row.projectAllocations.map((part) => ({ projectId: part.projectId, name: part.project?.name ?? part.projectName, quantity: part.quantity.toNumber() }));
  return { acquisitionId: row.id, revision: row.allocationRevision, quantity, unit: row.purchasedQuantity !== null ? row.purchasedUnit : row.unit,
    explicit: row.allocationHouseholdQuantity !== null, householdQuantity, projects,
    unallocatedQuantity: (milli(quantity) - milli(householdQuantity) - projects.reduce((sum, part) => sum + milli(part.quantity), 0)) / 1000 };
}
export async function getGoodsAllocation(householdId: string, acquisitionId: string) {
  const row = await db.stockPurchase.findFirst({ where: { id: acquisitionId, householdId }, include: goodsAllocationInclude });
  if (!row) throw notFound("Acquisition not found");
  return goodsAllocationView(row);
}

/** Purpose shares of existing goods. No stock movement, reservation, requirement fulfilment or money entry. */
export async function setGoodsAllocation(householdId: string, acquisitionId: string, input: GoodsAllocationInput) {
  const parsed = goodsAllocationInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Check the quantities and revision");
  input = parsed.data;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "stock_purchases" WHERE "id" = ${acquisitionId} AND "householdId" = ${householdId} FOR UPDATE`;
    const row = await tx.stockPurchase.findFirst({ where: { id: acquisitionId, householdId }, include: goodsAllocationInclude });
    if (!row) throw notFound("Acquisition not found");
    const current = goodsAllocationView(row);
    const normalize = (parts: { projectId: string | null; quantity: number }[]) => JSON.stringify(parts.map((part) => [part.projectId, milli(part.quantity)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    if (current.explicit && milli(input.householdQuantity) === milli(current.householdQuantity) && normalize(input.projects) === normalize(current.projects)) return current;
    if (current.revision !== input.revision) throw conflict("The goods allocation changed. Review the current quantities before saving.");
    if (milli(input.householdQuantity) + input.projects.reduce((sum, part) => sum + milli(part.quantity), 0) > milli(current.quantity))
      throw badRequest("Allocated quantities exceed the acquired goods", { projects: ["Allocated quantities exceed the acquired goods"] });
    const projects = await tx.project.findMany({ where: { householdId, id: { in: input.projects.map((part) => part.projectId) } }, select: { id: true, name: true } });
    if (projects.length !== input.projects.length) throw badRequest("Choose projects available to this household");
    await tx.purchaseProjectAllocation.deleteMany({ where: { purchaseId: acquisitionId } });
    if (input.projects.length) await tx.purchaseProjectAllocation.createMany({ data: input.projects.map((part) => ({ purchaseId: acquisitionId, projectId: part.projectId, projectName: projects.find((project) => project.id === part.projectId)!.name, quantity: part.quantity })) });
    return goodsAllocationView(await tx.stockPurchase.update({ where: { id: acquisitionId }, data: { allocationHouseholdQuantity: input.householdQuantity, allocationRevision: { increment: 1 } }, include: goodsAllocationInclude }));
  });
  publish(householdId, "records.changed", { feature: "purchases", acquisitionId });
  return result;
}
