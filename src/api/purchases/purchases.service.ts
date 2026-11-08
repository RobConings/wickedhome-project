import { goodsAllocationInclude, goodsAllocationView } from "./goods-allocation.service";
import type { SessionUser } from "@/features/auth/types/auth";
import type { PurchaseDetail, PurchaseLine, PurchaseSummary } from "@/features/purchases/types/purchases";
import { db, type Prisma } from "../lib/db";
import { notFound } from "../lib/http";

const lineInclude = { ...goodsAllocationInclude, sessionItem: { select: { requirementIds: true } } } as const;
const include = { session: { select: { name: true } }, stockPurchases: { include: lineInclude }, receipts: true,
  payments: { include: { expense: { select: { id: true, payee: true, amountCents: true, paidOn: true } } } } } as const;
type Header = Prisma.ShoppingPurchaseGetPayload<{ include: typeof include }>;
type Acquisition = Prisma.StockPurchaseGetPayload<{ include: typeof lineInclude }>;

async function context(householdId: string, lines: Acquisition[], shopIds: string[]) {
  const [products, shops] = await Promise.all([
    db.product.findMany({ where: { householdId, id: { in: lines.flatMap((line) => [line.productId, ...(line.purchasedProductId ? [line.purchasedProductId] : [])]) } }, select: { id: true, name: true } }),
    db.shop.findMany({ where: { id: { in: shopIds }, OR: [{ householdId }, { householdId: null }] }, select: { id: true, name: true } }),
  ]);
  return { products: new Map(products.map((row) => [row.id, row.name])), shops: new Map(shops.map((row) => [row.id, row.name])) };
}
function line(row: Acquisition, names: Map<string, string>): PurchaseLine {
  return { allocation: goodsAllocationView(row), id: row.id, productId: row.purchasedProductId, stockProductId: row.productId,
    catalogueProductId: row.purchasedProductId && names.has(row.purchasedProductId) ? row.purchasedProductId : names.has(row.productId) ? row.productId : null,
    name: row.purchasedProductName ?? names.get(row.productId) ?? null,
    quantity: row.purchasedQuantity?.toNumber() ?? row.quantity.toNumber(), unit: row.purchasedQuantity !== null ? row.purchasedUnit : row.unit,
    stockQuantity: row.quantity.toNumber(), stockUnit: row.unit, stockAdded: row.stockAdded, stockItemId: row.stockItemId,
    sessionItemId: row.sessionItemId, requirementIds: row.sessionItem?.requirementIds ?? (row.shoppingItemId ? [row.shoppingItemId] : []) };
}
function summary(row: Header, names: Map<string, string>, canReadMoney: boolean): PurchaseSummary {
  return { id: row.id, kind: "visit", name: row.session.name, sessionId: row.sessionId,
    purchasedAt: row.purchasedAt.toISOString(), shopName: row.shopId ? names.get(row.shopId) ?? null : null,
    lineCount: row.stockPurchases.length, receiptCount: row.receipts.length,
    totalCents: canReadMoney ? row.totalCents : null,
    linkedPaidCents: canReadMoney ? row.payments.reduce((sum, payment) => sum + (payment.expense?.paidOn ? payment.expense.amountCents : 0), 0) : null, canReadMoney };
}

/** Views of existing acquisitions, not a second purchase ledger. Empty planned visits stay in Shopping. */
export async function listPurchases(user: SessionUser, filter: { productId?: string; projectId?: string } = {}): Promise<PurchaseSummary[]> {
  const lineFilters: Prisma.StockPurchaseWhereInput[] = [];
  const headerFilters: Prisma.ShoppingPurchaseWhereInput[] = [];
  if (filter.productId) {
    const product = await db.product.findFirst({ where: { householdId: user.householdId, id: filter.productId }, select: { id: true, stockProductId: true } });
    if (!product) throw notFound("Product not found");
    const owner = product.stockProductId ?? product.id;
    const ids = (await db.product.findMany({ where: { householdId: user.householdId, OR: [{ id: owner }, { stockProductId: owner }] }, select: { id: true } })).map((row) => row.id);
    const productFilter = { OR: [{ productId: { in: ids } }, { purchasedProductId: { in: ids } }] };
    lineFilters.push(productFilter); headerFilters.push({ stockPurchases: { some: productFilter } });
  }
  if (filter.projectId) {
    const projectId = filter.projectId;
    if (!await db.project.count({ where: { id: projectId, householdId: user.householdId } })) throw notFound("Project not found");
    const taskIds = (await db.task.findMany({ where: { householdId: user.householdId, projectId }, select: { id: true } })).map((row) => row.id);
    const requirementIds = (await db.shoppingItem.findMany({ where: { householdId: user.householdId, OR: [{ projectId }, { projectId: null, taskId: { in: taskIds } }] }, select: { id: true } })).map((row) => row.id);
    const requirementFilter = { OR: [{ projectAllocations: { some: { projectId } } }, { shoppingItemId: { in: requirementIds } }, { sessionItem: { requirementIds: { hasSome: requirementIds } } }] };
    lineFilters.push(requirementFilter);
    headerFilters.push({ OR: [{ stockPurchases: { some: requirementFilter } }, { payments: { some: { expense: { OR: [{ projectId }, { projectAllocations: { some: { projectId } } }] } } } }] });
  }
  const [headers, acquisitions] = await Promise.all([
    db.shoppingPurchase.findMany({ where: { householdId: user.householdId, AND: [{ OR: [{ stockPurchases: { some: {} } }, { receipts: { some: {} } }, { payments: { some: {} } }] }, ...headerFilters] }, include, orderBy: { purchasedAt: "desc" }, take: 200 }),
    db.stockPurchase.findMany({ where: { householdId: user.householdId, shoppingPurchaseId: null, AND: lineFilters }, include: lineInclude, orderBy: { purchasedAt: "desc" }, take: 200 }),
  ]);
  const ctx = await context(user.householdId, acquisitions, [...headers, ...acquisitions].flatMap((row) => row.shopId ? [row.shopId] : []));
  return [...headers.map((row) => summary(row, ctx.shops, user.role !== "child")), ...acquisitions.map((row): PurchaseSummary => ({
    id: row.id, kind: "acquisition", name: row.purchasedProductName ?? ctx.products.get(row.productId) ?? null,
    sessionId: null, purchasedAt: row.purchasedAt.toISOString(), shopName: row.shopId ? ctx.shops.get(row.shopId) ?? null : null,
    lineCount: 1, receiptCount: 0, totalCents: null, linkedPaidCents: null, canReadMoney: user.role !== "child",
  }))].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export async function getPurchase(user: SessionUser, id: string, kind: "visit" | "acquisition" = "visit"): Promise<PurchaseDetail> {
  if (kind === "acquisition") {
    const row = await db.stockPurchase.findFirst({ where: { id, householdId: user.householdId, shoppingPurchaseId: null }, include: lineInclude });
    if (!row) throw notFound("Acquisition not found");
    const ctx = await context(user.householdId, [row], row.shopId ? [row.shopId] : []);
    const item = line(row, ctx.products);
    return { id, kind, name: item.name, purchasedAt: row.purchasedAt.toISOString(), sessionId: null,
      shopName: row.shopId ? ctx.shops.get(row.shopId) ?? null : null, lineCount: 1, receiptCount: 0,
      totalCents: null, linkedPaidCents: null, canReadMoney: user.role !== "child", lines: [item], receipts: [], expenses: [] };
  }
  const row = await db.shoppingPurchase.findFirst({ where: { id, householdId: user.householdId }, include });
  if (!row) throw notFound("Purchase not found");
  const ctx = await context(user.householdId, row.stockPurchases, row.shopId ? [row.shopId] : []);
  return { ...summary(row, ctx.shops, user.role !== "child"), lines: row.stockPurchases.map((row) => line(row, ctx.products)),
    receipts: row.receipts.map((receipt) => ({ id: receipt.id, documentId: receipt.documentId, name: receipt.filename, purchasedAt: receipt.purchasedAt.toISOString(), totalCents: user.role === "child" ? null : receipt.totalCents })),
    expenses: user.role === "child" ? [] : row.payments.flatMap((payment) => payment.expense ? [{ id: payment.expense.id, name: payment.expense.payee, amountCents: payment.expense.amountCents, paidOn: payment.expense.paidOn?.toISOString().slice(0, 10) ?? null }] : []) };
}
