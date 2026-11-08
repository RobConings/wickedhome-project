import type { ProductContext } from "@/features/catalogue/types/product-context";
import { db } from "../lib/db";
import { notFound } from "../lib/http";
import { listItems } from "../shopping/shopping.service";

/** A product is related through needs and tasks, never through a duplicate project-specific product. */
export async function getProductContext(householdId: string, id: string): Promise<ProductContext> {
  const product = await db.product.findFirst({ where: { id, householdId }, select: { id: true, stockProductId: true } });
  if (!product) throw notFound("Product not found");
  const ownerId = product.stockProductId ?? product.id;
  const family = (await db.product.findMany({ where: { householdId, OR: [{ id: ownerId }, { stockProductId: ownerId }] }, select: { id: true } })).map((row) => row.id);
  const [requirements, needs] = await Promise.all([
    db.shoppingItem.findMany({ where: { householdId, productId: { in: family } }, select: { taskId: true, projectId: true } }),
    listItems(householdId, { status: "open" }),
  ]);
  const tasks = await db.task.findMany({ where: { householdId, id: { in: requirements.flatMap((row) => row.taskId ? [row.taskId] : []) } }, select: { id: true, title: true, status: true, projectId: true } });
  const allocations = await db.purchaseProjectAllocation.findMany({ where: { purchase: { householdId, productId: { in: family } } }, select: { projectId: true } });
  const projectIds = [...new Set([...allocations.flatMap((part) => part.projectId ? [part.projectId] : []),...requirements.flatMap((row) => row.projectId ? [row.projectId] : []), ...tasks.flatMap((row) => row.projectId ? [row.projectId] : [])])];
  const projects = await db.project.findMany({ where: { householdId, id: { in: projectIds } }, select: { id: true, name: true, coverFileId: true } });
  return { productId: ownerId,
    needs: needs.filter((need) => need.productId && family.includes(need.productId)).map((need) => ({ id: need.id, name: need.name, quantity: need.quantity, unit: need.unit, listIds: [...new Set((need.requirements ?? [need]).map((part) => part.listId))] })),
    tasks: tasks.map((task) => ({ id: task.id, name: task.title, status: task.status.toLowerCase() })),
    projects: projects.map((project) => ({ id: project.id, name: project.name, imageUrl: project.coverFileId ? `/api/documents/files/${encodeURIComponent(project.coverFileId)}/content` : null })) };
}
