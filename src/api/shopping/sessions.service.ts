import {
  shoppingStockStatus,
  shoppingStockNeed,
} from "@/features/shopping/types/shopping";
import { householdStockUnit } from "@/types/units";
import { createHash } from "node:crypto";
import type { SessionUser } from "@/features/auth/types/auth";
import type {
  ReceiptAttachInput,
  ReceiptLineInput,
  SessionAddItemInput,
  SessionCreateInput,
  SessionItemUpdateInput,
  SessionView,
  SessionSummary,
} from "@/features/shopping/types/sessions";
import {
  shoppingAmount,
  visitRequirements,
} from "@/features/shopping/types/shopping-product-rows";
import { db, type Prisma, type ShoppingSessionItem } from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { publish } from "../lib/events";
import { lockStock } from "../inventory/stock-lock";
import {
  applyPurchaseInTransaction,
  creditRecordedPurchaseInTransaction,
  listStock,
} from "../inventory/inventory.service";
import { preparePurchase } from "../inventory/purchases.service";
import {
  getItem,
  getShoppingOverview,
  listItems,
  suppressShoppingRestock,
} from "./shopping.service";

const round = (value: number) => Math.round(value * 1000) / 1000;
const manager = (user: SessionUser) => {
  if (user.role === "child")
    throw forbidden("Only adults manage shopping visits and payments");
};
const summary = (row: {
  id: string;
  name: string;
  status: string;
  startedAt: Date;
  closedAt: Date | null;
  shopIds: string[];
  revision: number;
}): SessionSummary => ({
  ...row,
  status: row.status === "ACTIVE" ? "active" : "closed",
  startedAt: row.startedAt.toISOString(),
  closedAt: row.closedAt?.toISOString() ?? null,
});

export async function listShoppingSessions(user: SessionUser) {
  return (
    await db.shoppingSession.findMany({
      where: { householdId: user.householdId },
      orderBy: { startedAt: "desc" },
      take: 100,
    })
  ).map(summary);
}

export async function getShoppingSession(
  user: SessionUser,
  id: string,
): Promise<SessionView> {
  const row = await db.shoppingSession.findFirst({
    where: { id, householdId: user.householdId },
    include: {
      items: { where: { removedAt: null }, orderBy: { createdAt: "asc" } },
      participants: true,
      purchases: {
        include: {
          receipts: true,
          stockPurchases: {
            include: { sessionItem: { select: { name: true } } },
          },
          payments: {
            include: {
              expense: {
                select: {
                  id: true,
                  payee: true,
                  amountCents: true,
                  paidOn: true,
                  paymentAccountId: true,
                  payerType: true,
                  payerHabitantId: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row) throw notFound("Shopping visit not found");
  const users = await db.user.findMany({
    where: {
      householdId: user.householdId,
      id: { in: row.participants.map((part) => part.userId) },
    },
    select: { id: true, email: true, habitant: { select: { name: true } } },
  });
  const stock = await listStock(user.householdId);
  const products = await db.product.findMany({
    where: {
      householdId: user.householdId,
      id: {
        in: row.items.flatMap((item) =>
          item.productId ? [item.productId] : [],
        ),
      },
    },
    select: { id: true, isEssential: true, stockProductId: true },
  });
  const byProduct = new Map(products.map((product) => [product.id, product]));
  return {
    ...summary(row),
    items: row.items.map((item) => {
      const product = item.productId ? byProduct.get(item.productId) : null;
      const stockStatus = shoppingStockStatus(
        stock.filter(
          (entry) =>
            entry.productId === (product?.stockProductId ?? item.productId),
        ),
        null,
      );
      return {
        ...item,
        stockNeed: shoppingStockNeed(stockStatus, product?.isEssential),
        isEssential: product?.isEssential ?? null,
        stockStatus,
        category: item.category.toLowerCase(),
        quantity: item.quantity.toNumber(),
        purchasedQuantity: item.purchasedQuantity.toNumber(),
        status: item.status.toLowerCase() as "open" | "bought" | "skipped",
      };
    }),
    participants: row.participants.map((part) => ({
      userId: part.userId,
      name:
        users.find((user) => user.id === part.userId)?.habitant?.name ??
        users.find((user) => user.id === part.userId)?.email ??
        "Former member",
    })),
    purchases: row.purchases.map((purchase) => ({
      id: purchase.id,
      shopId: purchase.shopId,
      purchasedAt: purchase.purchasedAt.toISOString(),
      totalCents: purchase.totalCents,
      receipts: purchase.receipts.map((receipt) => ({
        ...receipt,
        purchasedAt: receipt.purchasedAt.toISOString(),
      })),
      payments:
        user.role === "child"
          ? []
          : purchase.payments.map((payment) => ({
              id: payment.id,
              expenseId: payment.expenseId,
              receiptId: payment.receiptId,
              amountCents: payment.expense?.amountCents ?? payment.amountCents,
              payee: payment.expense?.payee ?? "Deleted expense",
              paidOn:
                payment.expense?.paidOn?.toISOString().slice(0, 10) ?? null,
              paymentAccountId: payment.expense?.paymentAccountId ?? null,
              payerType: payment.expense?.payerType.toLowerCase() ?? null,
              payerHabitantId: payment.expense?.payerHabitantId ?? null,
            })),
      lines: purchase.stockPurchases.map((line) => ({
        name: line.sessionItem?.name ?? line.productId,
        id: line.id,
        sessionItemId: line.sessionItemId,
        quantity: line.quantity.toNumber(),
        unit: line.unit,
        stockAdded: line.stockAdded,
      })),
    })),
    stockOptions: stock.map((item) => ({
      id: item.id,
      productId: item.productId,
      placeName: item.placeName,
      unit: item.unit,
    })),
  };
}

/** Explicitly starts a new planning cycle. Existing visits keep their independent snapshots. */
export async function planShoppingVisit(user: SessionUser) {
  manager(user);
  await db.product.updateMany({
    where: {
      householdId: user.householdId,
      shoppingRestockState: { not: "ACTIVE" },
    },
    data: { shoppingRestockState: "ACTIVE" },
  });
  const overview = await getShoppingOverview(user.householdId, user.locale);
  publish(user.householdId, "shopping.changed", { scope: "requirements" });
  return overview;
}

async function seedItem(user: SessionUser, input: SessionAddItemInput) {
  const requirement = input.requirementId
    ? await getItem(user.householdId, input.requirementId)
    : null;
  const productId = input.productId ?? requirement?.productId ?? null;
  const product = productId
    ? await db.product.findFirst({
        where: { id: productId, householdId: user.householdId },
        include: {
          stockItems: { select: { unit: true } },
          stockProduct: { select: { stockItems: { select: { unit: true } } } },
        },
      })
    : null;
  if (productId && !product) throw notFound("Product not found");
  if (
    input.stockItemId &&
    !(await db.stockItem.count({
      where: {
        id: input.stockItemId,
        householdId: user.householdId,
        productId: product?.stockProductId ?? productId ?? "",
      },
    }))
  )
    throw notFound("Stock location not found");
  if (requirement?.amounts)
    throw badRequest(
      "Resolve the package/unit mismatch before adding this requirement to a visit",
    );
  return {
    productId,
    itemKey: productId
      ? `product:${productId}`
      : requirement
        ? `requirement:${requirement.id}`
        : `name:${input.name!.toLocaleLowerCase("nl")}`,
    requirementIds: requirement
      ? (requirement.requirements ?? [requirement]).map((part) => part.id)
      : [],
    name: product?.name ?? requirement?.name ?? input.name!,
    category:
      product?.category ??
      (requirement?.category?.toUpperCase() as Prisma.ShoppingSessionItemCreateInput["category"]) ??
      (input.category?.toUpperCase() as Prisma.ShoppingSessionItemCreateInput["category"]) ??
      "OTHER",
    quantity: requirement?.quantity ?? input.quantity,
    unit:
      requirement?.unit ??
      input.unit ??
      (product
        ? householdStockUnit(
            product.unit,
            product.stockProduct?.stockItems ?? product.stockItems,
          )
        : null),
    shopId: requirement?.shopId ?? product?.defaultShopId ?? null,
    stockItemId: input.stockItemId ?? null,
  };
}

async function addItemTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
  item: Awaited<ReturnType<typeof seedItem>>,
) {
  const previous = await tx.shoppingSessionItem.findUnique({
    where: { sessionId_itemKey: { sessionId, itemKey: item.itemKey } },
  });
  if (previous)
    return previous.removedAt
      ? tx.shoppingSessionItem.update({
          where: { id: previous.id },
          data: { removedAt: null, revision: { increment: 1 } },
        })
      : previous;
  return tx.shoppingSessionItem.create({ data: { sessionId, ...item } });
}

export async function createShoppingSession(
  user: SessionUser,
  input: SessionCreateInput,
) {
  manager(user);
  const sourceKey = `visit-start:${user.id}:${input.operationId ?? crypto.randomUUID()}`;
  const startHash = createHash("sha256")
    .update(
      JSON.stringify({
        name: input.name,
        shopIds: [...input.shopIds].sort(),
        shopGroupId: input.shopGroupId,
        requirementIds: [...input.requirementIds].sort(),
        includeLowStock: input.includeLowStock,
      }),
    )
    .digest("hex");
  const previous = await db.shoppingPurchase.findUnique({
    where: {
      householdId_sourceKey: { householdId: user.householdId, sourceKey },
    },
    include: {
      session: { include: { operations: { where: { key: "start" } } } },
    },
  });
  if (previous) {
    if (previous.session.operations[0]?.payloadHash !== startHash)
      throw conflict("This start operation identifies a different visit");
    return getShoppingSession(user, previous.sessionId);
  }
  const group = input.shopGroupId
    ? await db.shopGroup.findFirst({
        where: { id: input.shopGroupId, householdId: user.householdId },
        include: { members: true },
      })
    : null;
  if (input.shopGroupId && !group) throw notFound("Shop group not found");
  const shopIds = [
    ...new Set(group?.members.map((member) => member.shopId) ?? input.shopIds),
  ];
  if (
    (await db.shop.count({
      where: {
        OR: [{ householdId: user.householdId }, { householdId: null }],
        id: { in: shopIds },
      },
    })) !== shopIds.length
  )
    throw notFound("Shop not found");
  const requirements = input.requirementIds.length
    ? await listItems(user.householdId, { status: "open" }, user.locale)
    : [];
  const chosen = new Set(input.requirementIds);
  const selected = requirements.filter(
    (item) =>
      (item.requirements ?? [item]).some((part) => chosen.has(part.id)) ||
      chosen.has(item.id),
  );
  if (
    [...chosen].some(
      (id) =>
        !selected.some(
          (item) =>
            item.id === id || item.requirements?.some((part) => part.id === id),
        ),
    )
  )
    throw badRequest(
      "Some selected requirements have changed; refresh the planning list",
    );
  const catalogue = await db.product.findMany({
    where: {
      householdId: user.householdId,
      id: {
        in: selected.flatMap((item) =>
          item.productId ? [item.productId] : [],
        ),
      },
    },
    select: { id: true, unit: true, packageAmount: true, packageUnit: true },
  });
  const productUnits = new Map(
    catalogue.map((product) => [
      product.id,
      { ...product, packageAmount: product.packageAmount?.toNumber() ?? null },
    ]),
  );
  const seeds = await Promise.all(
    visitRequirements(selected, input.includeLowStock, productUnits).map(
      async (item) => ({
        ...(await seedItem(user, {
          requirementId: item.id,
          quantity: item.quantity,
        })),
        quantity: item.quantity,
        unit: item.unit,
        requirementIds: (item.requirements ?? [item]).map((part) => part.id),
      }),
    ),
  );
  const session = await db.$transaction(async (tx) => {
    await lockStock(tx, user.householdId);
    const prior = await tx.shoppingPurchase.findUnique({
      where: {
        householdId_sourceKey: { householdId: user.householdId, sourceKey },
      },
      include: {
        session: { include: { operations: { where: { key: "start" } } } },
      },
    });
    if (prior) {
      if (prior.session.operations[0]?.payloadHash !== startHash)
        throw conflict("This start operation identifies a different visit");
      return prior.session;
    }
    const created = await tx.shoppingSession.create({
      data: {
        householdId: user.householdId,
        name: input.name,
        shopIds,
        shopGroupId: input.shopGroupId,
        createdByUserId: user.id,
        operations: {
          create: { key: "start", payloadHash: startHash, userId: user.id },
        },
        participants: { create: { userId: user.id } },
        purchases: {
          create: {
            householdId: user.householdId,
            sourceKey,
            shopId: shopIds.length === 1 ? shopIds[0] : null,
          },
        },
      },
    });
    for (const seed of seeds) await addItemTx(tx, created.id, seed);
    return created;
  });
  publish(user.householdId, "shopping.changed", {
    scope: "session",
    sessionId: session.id,
  });
  return getShoppingSession(user, session.id);
}

export async function withShoppingSessionTransaction<T>(
  user: SessionUser,
  sessionId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  allowClosed = false,
) {
  const result = await db.$transaction(
    async (tx) => {
      await lockStock(tx, user.householdId);
      const session = await tx.shoppingSession.findFirst({
        where: { id: sessionId, householdId: user.householdId },
      });
      if (!session) throw notFound("Shopping visit not found");
      if (!allowClosed && session.status !== "ACTIVE")
        throw conflict("This shopping visit is closed");
      const result = await work(tx);
      await tx.shoppingSession.update({
        where: { id: sessionId },
        data: { revision: { increment: 1 } },
      });
      return result;
    },
    { timeout: 15_000 },
  );
  publish(user.householdId, "shopping.changed", {
    scope: "session",
    sessionId,
  });
  return result;
}

export async function addShoppingSessionItem(
  user: SessionUser,
  sessionId: string,
  input: SessionAddItemInput,
) {
  const seed = await seedItem(user, input);
  await withShoppingSessionTransaction(
    user,
    sessionId,
    (tx) => addItemTx(tx, sessionId, seed),
    user.role !== "child",
  );
  return getShoppingSession(user, sessionId);
}

async function acquire(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  sessionId: string,
  item: ShoppingSessionItem,
  target: number,
  operationId: string,
  stockItemId?: string,
  receipt?: {
    purchasedAt: Date;
    shopId?: string | null;
    countDisposition?: "already_counted" | "add_after_count";
  },
) {
  const delta = round(target - item.purchasedQuantity.toNumber());
  if (delta <= 0) return;
  const purchase = await tx.shoppingPurchase.findFirstOrThrow({
    where: { sessionId, householdId: user.householdId },
  });
  const product = item.productId
    ? await tx.product.findFirst({
        where: { id: item.productId, householdId: user.householdId },
      })
    : null;
  const ownerId = product?.stockProductId ?? product?.id;
  const stocks = ownerId
    ? await tx.stockItem.findMany({
        where: { householdId: user.householdId, productId: ownerId },
      })
    : [];
  const targetId = stockItemId ?? item.stockItemId;
  const stock = targetId
    ? stocks.find((row) => row.id === targetId)
    : stocks.length === 1
      ? stocks[0]
      : null;
  if ((targetId || stocks.length > 1) && !stock)
    throw badRequest("Choose the stock location for this purchase");
  const sourceKey = `visit:${sessionId}:${item.id}:${operationId}`;
  if (stock && product) {
    const quantity = shoppingAmount(
      delta,
      item.unit,
      stock.unit ?? product.unit,
      {
        unit: product.unit,
        packageAmount: product.packageAmount?.toNumber() ?? null,
        packageUnit: product.packageUnit,
      },
    );
    if (quantity === null)
      throw badRequest("Verify package size and units before crediting stock");
    await applyPurchaseInTransaction(tx, user, stock.id, {
      quantity,
      source: { kind: "manual", reference: operationId },
      sourceKey,
      shoppingPurchaseId: purchase.id,
      sessionItemId: item.id,
      shopId: receipt?.shopId ?? purchase.shopId ?? item.shopId ?? undefined,
      trustedShopping: !receipt?.shopId && !purchase.shopId,
      separatePurchaseConfirmed: true,
      purchasedAt: receipt?.purchasedAt.toISOString(),
      countDisposition: receipt?.countDisposition,
    });
    await tx.shoppingSessionItem.update({
      where: { id: item.id },
      data: { stockItemId: stock.id },
    });
    await tx.product.updateMany({
      where: { id: ownerId, householdId: user.householdId },
      data: { shoppingRestockState: "RESTOCKED" },
    });
  } else {
    const line = await tx.stockPurchase.create({
      data: {
        householdId: user.householdId,
        stockItemId: `untracked:${item.id}`,
        productId: item.productId ?? `unlinked:${item.id}`,
        quantity: delta,
        unit: item.unit,
        purchasedAt: receipt?.purchasedAt ?? new Date(),
        stockAdded: false,
        userId: user.id,
        shoppingPurchaseId: purchase.id,
        sessionItemId: item.id,
        shopId: receipt?.shopId ?? purchase.shopId ?? item.shopId,
        shopConfirmed: Boolean(receipt?.shopId || purchase.shopId),
      },
    });
    await tx.stockPurchaseEvidence.create({
      data: {
        householdId: user.householdId,
        sourceKey,
        stockItemId: line.stockItemId,
        quantity: delta,
        purchaseIds: [line.id],
      },
    });
  }
}

export async function updateShoppingSessionItem(
  user: SessionUser,
  sessionId: string,
  id: string,
  input: SessionItemUpdateInput,
) {
  await withShoppingSessionTransaction(user, sessionId, async (tx) => {
    const item = await tx.shoppingSessionItem.findFirst({
      where: { id, sessionId, removedAt: null },
    });
    if (!item) throw notFound("Shopping visit item not found");
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify({
          id,
          status: input.status,
          quantity: input.quantity,
          purchasedQuantity: input.purchasedQuantity,
          stockItemId: input.stockItemId,
          remove: input.remove,
        }),
      )
      .digest("hex");
    const operation = await tx.shoppingSessionOperation.findUnique({
      where: { sessionId_key: { sessionId, key: input.operationId } },
    });
    if (operation) {
      if (operation.payloadHash !== payloadHash)
        throw conflict(
          "An operation id cannot be reused for a different change",
        );
      return;
    }
    const remember = () =>
      tx.shoppingSessionOperation.create({
        data: {
          sessionId,
          key: input.operationId,
          payloadHash,
          userId: user.id,
        },
      });
    const target =
      input.purchasedQuantity ??
      (input.status === "bought"
        ? (input.quantity ?? item.quantity.toNumber())
        : item.purchasedQuantity.toNumber());
    if (
      input.status === "bought" &&
      target === item.purchasedQuantity.toNumber() &&
      item.status === "BOUGHT" &&
      !input.quantity &&
      !input.remove
    ) {
      await remember();
      return;
    }
    if (item.revision !== input.revision)
      throw conflict(
        "Someone changed this item. Refresh before applying your change.",
      );
    if (target < item.purchasedQuantity.toNumber())
      throw badRequest(
        "Undoing a tick does not remove real goods; correct the stock count explicitly",
      );
    await acquire(
      tx,
      user,
      sessionId,
      item,
      target,
      input.operationId,
      input.stockItemId,
    );
    const status =
      input.status === "skipped"
        ? "SKIPPED"
        : input.status === "open"
          ? "OPEN"
          : target >= (input.quantity ?? item.quantity.toNumber()) && target > 0
            ? "BOUGHT"
            : "OPEN";
    await tx.shoppingSessionItem.update({
      where: { id },
      data: {
        quantity: input.quantity,
        purchasedQuantity: target,
        status,
        stockItemId: input.stockItemId,
        removedAt: input.remove ? new Date() : undefined,
        revision: { increment: 1 },
      },
    });
    await remember();
    if (status === "BOUGHT" && item.productId) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, householdId: user.householdId },
        select: { stockProductId: true },
      });
      await suppressShoppingRestock(
        tx,
        user.householdId,
        [product?.stockProductId ?? item.productId],
        item.requirementIds,
      );
    }
    // Only completing the full requirement marks it bought; partial goods never erase an unmet need.
    if (status === "BOUGHT" && item.requirementIds.length)
      await tx.shoppingItem.updateMany({
        where: {
          householdId: user.householdId,
          id: { in: item.requirementIds },
          status: "OPEN",
        },
        data: {
          status: "BOUGHT",
          boughtAt: new Date(),
          boughtByUserId: user.id,
        },
      });
  });
  return getShoppingSession(user, sessionId);
}

export async function joinShoppingSession(
  user: SessionUser,
  sessionId: string,
) {
  await withShoppingSessionTransaction(user, sessionId, (tx) =>
    tx.shoppingSessionParticipant.upsert({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      create: { sessionId, userId: user.id },
      update: {},
    }),
  );
  return getShoppingSession(user, sessionId);
}

export async function closeShoppingSession(
  user: SessionUser,
  sessionId: string,
  revision: number,
) {
  manager(user);
  await withShoppingSessionTransaction(
    user,
    sessionId,
    async (tx) => {
      const session = await tx.shoppingSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      if (session.status === "CLOSED") return;
      if (session.revision !== revision)
        throw conflict("The visit changed; refresh before closing it");
      if (
        await tx.shoppingSessionItem.count({
          where: { sessionId, removedAt: null, status: "OPEN" },
        })
      )
        throw conflict(
          "Buy, skip or remove the remaining items before closing this visit",
        );
      await tx.shoppingSession.update({
        where: { id: sessionId },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    },
    true,
  );
  return getShoppingSession(user, sessionId);
}

export async function attachShoppingReceipt(
  user: SessionUser,
  sessionId: string,
  input: ReceiptAttachInput,
) {
  manager(user);
  await withShoppingSessionTransaction(
    user,
    sessionId,
    async (tx) => {
      const document = await tx.documentFile.findFirst({
        where: {
          id: input.documentId,
          householdId: user.householdId,
          deletedAt: null,
          uploadedAt: { not: null },
        },
      });
      if (!document?.sha256)
        throw badRequest("Upload the receipt document first");
      if (new Date(input.purchasedAt).getTime() > Date.now() + 300_000)
        throw badRequest("A receipt cannot be in the future");
      if (
        input.shopId &&
        !(await tx.shop.count({
          where: {
            id: input.shopId,
            OR: [{ householdId: user.householdId }, { householdId: null }],
          },
        }))
      )
        throw notFound("Shop not found");
      const purchase = await tx.shoppingPurchase.findFirstOrThrow({
        where: { sessionId, householdId: user.householdId },
      });
      const existing = await tx.shoppingReceipt.findUnique({
        where: {
          householdId_contentHash: {
            householdId: user.householdId,
            contentHash: document.sha256,
          },
        },
      });
      if (existing) {
        if (existing.purchaseId !== purchase.id)
          throw conflict("This receipt is already linked to another visit");
        return existing;
      }
      const created = await tx.shoppingReceipt.create({
        data: {
          shopId: input.shopId ?? purchase.shopId,
          householdId: user.householdId,
          purchaseId: purchase.id,
          documentId: document.id,
          contentHash: document.sha256,
          filename: document.name,
          totalCents: input.totalCents,
          purchasedAt: new Date(input.purchasedAt),
        },
      });
      const totals = await tx.shoppingReceipt.aggregate({
        where: { purchaseId: purchase.id },
        _sum: { totalCents: true },
      });
      await tx.shoppingPurchase.update({
        where: { id: purchase.id },
        data: {
          purchasedAt:
            (
              await tx.shoppingReceipt.aggregate({
                where: { purchaseId: purchase.id },
                _min: { purchasedAt: true },
              })
            )._min.purchasedAt ?? purchase.purchasedAt,
          totalCents: (await tx.shoppingReceipt.count({
            where: { purchaseId: purchase.id, totalCents: null },
          }))
            ? null
            : totals._sum.totalCents,
        },
      });
      return created;
    },
    true,
  );
  return getShoppingSession(user, sessionId);
}

export async function reconcileShoppingReceiptLine(
  user: SessionUser,
  sessionId: string,
  receiptId: string,
  input: ReceiptLineInput,
) {
  manager(user);
  await withShoppingSessionTransaction(
    user,
    sessionId,
    async (tx) => {
      const receipt = await tx.shoppingReceipt.findFirst({
        where: {
          id: receiptId,
          householdId: user.householdId,
          purchase: { sessionId },
        },
        include: { purchase: true },
      });
      const item = await tx.shoppingSessionItem.findFirst({
        where: { id: input.sessionItemId, sessionId },
      });
      if (!receipt || !item) throw notFound("Receipt or visit item not found");
      const sourceKey = `receipt:${receipt.contentHash}:${input.reference}`;
      const prior = await tx.stockPurchaseEvidence.findUnique({
        where: {
          householdId_sourceKey: { householdId: user.householdId, sourceKey },
        },
      });
      let acquisitions = await tx.stockPurchase.findMany({
        where: {
          householdId: user.householdId,
          ...(input.existingPurchaseIds
            ? { id: { in: input.existingPurchaseIds } }
            : {
                shoppingPurchaseId: receipt.purchaseId,
                sessionItemId: item.id,
              }),
        },
      });
      if (
        input.existingPurchaseIds &&
        (acquisitions.length !== new Set(input.existingPurchaseIds).size ||
          acquisitions.some(
            (line) =>
              line.shoppingPurchaseId &&
              line.shoppingPurchaseId !== receipt.purchaseId,
          ))
      )
        throw badRequest(
          "Choose acquisitions belonging to this visit or unassigned goods from this household",
        );
      const product = item.productId
        ? await tx.product.findFirst({
            where: { id: item.productId, householdId: user.householdId },
          })
        : null;
      const ownerId = product?.stockProductId ?? product?.id;
      if (
        input.existingPurchaseIds &&
        acquisitions.some(
          (line) => line.productId !== (ownerId ?? `unlinked:${item.id}`),
        )
      )
        throw badRequest("An acquisition belongs to another product");
      let unit = acquisitions[0]?.unit ?? item.unit;
      let expected = shoppingAmount(
        input.quantity,
        item.unit,
        unit,
        product
          ? {
              unit: product.unit,
              packageAmount: product.packageAmount?.toNumber() ?? null,
              packageUnit: product.packageUnit,
            }
          : undefined,
      );
      if (expected === null)
        throw badRequest("Receipt and stock units cannot be compared safely");
      if (prior) {
        const priorLines = await tx.stockPurchase.findMany({
          where: {
            id: { in: prior.purchaseIds },
            householdId: user.householdId,
          },
        });
        if (
          prior.quantity.toNumber() !== expected ||
          priorLines.some((line) => line.sessionItemId !== item.id)
        )
          throw conflict(
            "This receipt line was already recorded for different goods or quantity",
          );
        return;
      }
      if (!input.existingPurchaseIds) {
        const evidence = acquisitions.length
          ? await tx.stockPurchaseEvidence.findMany({
              where: {
                householdId: user.householdId,
                sourceKey: { startsWith: "receipt:" },
                purchaseIds: { hasSome: acquisitions.map((line) => line.id) },
              },
            })
          : [];
        const used = new Set(evidence.flatMap((entry) => entry.purchaseIds));
        acquisitions = acquisitions.filter((line) => !used.has(line.id));
        const total = round(
          acquisitions.reduce((sum, line) => sum + line.quantity.toNumber(), 0),
        );
        if (total !== expected) {
          const exact = acquisitions.filter(
            (line) => line.quantity.toNumber() === expected,
          );
          if (exact.length === 1) acquisitions = exact;
          else if (
            total < expected &&
            (!item.purchasedQuantity.toNumber() || input.acceptDifference)
          ) {
            const missing = shoppingAmount(
              expected - total,
              unit,
              item.unit,
              product
                ? {
                    unit: product.unit,
                    packageAmount: product.packageAmount?.toNumber() ?? null,
                    packageUnit: product.packageUnit,
                  }
                : undefined,
            );
            if (missing === null)
              throw badRequest(
                "Verify the extra quantity in the visit item's unit",
              );
            const beforeIds = acquisitions.map((line) => line.id);
            await acquire(
              tx,
              user,
              sessionId,
              item,
              round(item.purchasedQuantity.toNumber() + missing),
              sourceKey,
              input.stockItemId,
              {
                purchasedAt: receipt.purchasedAt,
                shopId: receipt.shopId,
                countDisposition: input.countDisposition,
              },
            );
            acquisitions = await tx.stockPurchase.findMany({
              where: {
                householdId: user.householdId,
                shoppingPurchaseId: receipt.purchaseId,
                sessionItemId: item.id,
              },
            });
            const allEvidence = await tx.stockPurchaseEvidence.findMany({
              where: {
                householdId: user.householdId,
                sourceKey: { startsWith: "receipt:" },
                purchaseIds: { hasSome: acquisitions.map((line) => line.id) },
              },
            });
            const alreadyLinked = new Set(
              allEvidence.flatMap((entry) => entry.purchaseIds),
            );
            acquisitions = acquisitions.filter(
              (line) =>
                beforeIds.includes(line.id) || !alreadyLinked.has(line.id),
            );
          } else
            throw conflict(
              `Receipt quantity ${input.quantity} differs from unlinked acquisitions. Select the matching acquisitions or confirm an extra purchase; no stock has changed.`,
            );
        }
      }
      const total = round(
        acquisitions.reduce((sum, line) => sum + line.quantity.toNumber(), 0),
      );
      if (
        !acquisitions.length ||
        total !== expected ||
        acquisitions.some(
          (line) => line.stockItemId !== acquisitions[0]!.stockItemId,
        )
      )
        throw conflict(
          "Receipt quantities/locations differ from the chosen acquisitions; reconcile before linking",
        );
      let stockItemId = acquisitions[0]!.stockItemId;
      if (
        !stockItemId.startsWith("untracked:") &&
        input.stockItemId &&
        input.stockItemId !== stockItemId
      )
        throw conflict(
          "These goods were acquired at a different stock location; do not move them implicitly",
        );
      if (stockItemId.startsWith("untracked:") && input.stockItemId) {
        const stock = await tx.stockItem.findFirst({
          where: {
            id: input.stockItemId,
            householdId: user.householdId,
            productId: ownerId ?? "",
          },
        });
        if (!stock || !product)
          throw badRequest(
            "Choose this catalogue product's own stock location",
          );
        if (
          stock.lastCountedAt &&
          receipt.purchasedAt <= stock.lastCountedAt &&
          !input.countDisposition
        )
          throw conflict(
            "Were these goods already included in the stock count? Choose already counted or add after count.",
          );
        const stockUnit = stock.unit ?? product.unit;
        const converted = [];
        for (const acquisition of acquisitions) {
          const quantity = shoppingAmount(
            acquisition.quantity.toNumber(),
            acquisition.unit,
            stockUnit,
            {
              unit: product.unit,
              packageAmount: product.packageAmount?.toNumber() ?? null,
              packageUnit: product.packageUnit,
            },
          );
          if (quantity === null)
            throw badRequest(
              "Verify the package/unit conversion before adding these goods",
            );
          if (input.countDisposition !== "already_counted")
            await creditRecordedPurchaseInTransaction(
              tx,
              user,
              stock.id,
              quantity,
              acquisition.id,
            );
          converted.push(
            await tx.stockPurchase.update({
              where: { id: acquisition.id },
              data: {
                stockItemId: stock.id,
                unit: stockUnit,
                quantity,
                stockAdded: input.countDisposition !== "already_counted",
              },
            }),
          );
        }
        acquisitions = converted;
        stockItemId = stock.id;
        unit = stockUnit;
        expected = round(
          acquisitions.reduce((sum, line) => sum + line.quantity.toNumber(), 0),
        );
        await tx.product.updateMany({
          where: { id: stock.productId, householdId: user.householdId },
          data: { shoppingRestockState: "RESTOCKED" },
        });
        await tx.shoppingSessionItem.update({
          where: { id: item.id },
          data: { stockItemId: stock.id },
        });
      }
      if (stockItemId.startsWith("untracked:")) {
        await tx.stockPurchaseEvidence.create({
          data: {
            householdId: user.householdId,
            sourceKey,
            stockItemId,
            quantity: expected,
            purchaseIds: acquisitions.map((line) => line.id),
          },
        });
      } else {
        const stock = await tx.stockItem.findFirstOrThrow({
          where: { id: stockItemId, householdId: user.householdId },
        });
        await preparePurchase(tx, user, stock, {
          quantity: expected,
          source: {
            kind: "receipt",
            reference: input.reference,
            documentId: receipt.documentId ?? undefined,
          },
          sourceKey,
          shopId: receipt.shopId ?? receipt.purchase.shopId ?? undefined,
          purchasedAt: receipt.purchasedAt.toISOString(),
          existingPurchaseIds: acquisitions.map((line) => line.id),
        });
      }
      if (input.existingPurchaseIds)
        await tx.stockPurchase.updateMany({
          where: {
            householdId: user.householdId,
            id: { in: acquisitions.map((line) => line.id) },
          },
          data: {
            shoppingPurchaseId: receipt.purchaseId,
            sessionItemId: item.id,
          },
        });
      const allLines = await tx.stockPurchase.findMany({
        where: {
          householdId: user.householdId,
          shoppingPurchaseId: receipt.purchaseId,
          sessionItemId: item.id,
        },
      });
      const allStockQuantity = allLines.reduce(
        (sum, line) => sum + line.quantity.toNumber(),
        0,
      );
      const boughtQuantity = shoppingAmount(
        allStockQuantity,
        unit,
        item.unit,
        product
          ? {
              unit: product.unit,
              packageAmount: product.packageAmount?.toNumber() ?? null,
              packageUnit: product.packageUnit,
            }
          : undefined,
      );
      if (boughtQuantity === null)
        throw badRequest("Verify purchased quantity in the visit item's unit");
      await tx.shoppingSessionItem.update({
        where: { id: item.id },
        data: {
          purchasedQuantity: boughtQuantity,
          status:
            boughtQuantity >= item.quantity.toNumber() ? "BOUGHT" : "OPEN",
          revision: { increment: 1 },
        },
      });
      if (boughtQuantity >= item.quantity.toNumber() && ownerId)
        await suppressShoppingRestock(
          tx,
          user.householdId,
          [ownerId],
          item.requirementIds,
        );
      if (
        boughtQuantity >= item.quantity.toNumber() &&
        item.requirementIds.length
      )
        await tx.shoppingItem.updateMany({
          where: {
            householdId: user.householdId,
            id: { in: item.requirementIds },
            status: "OPEN",
          },
          data: {
            status: "BOUGHT",
            boughtAt: receipt.purchasedAt,
            boughtByUserId: user.id,
          },
        });
    },
    true,
  );
  return getShoppingSession(user, sessionId);
}
