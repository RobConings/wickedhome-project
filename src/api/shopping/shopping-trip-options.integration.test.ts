import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "../lib/db";
import { shoppingSessionFixture as fixture } from "./sessions-test-helpers";
import {
  closeShoppingSession,
  deleteShoppingSession,
  listShoppingSessions,
  getShoppingSession,
  updateShoppingSessionItem,
  attachShoppingReceipt,
  reconcileShoppingReceiptLine,
} from "./sessions.service";

const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => {
  if (enabled) await db.$disconnect();
});

it("a visit may finish without checking any suggestions; stock and needs remain unchanged", options, async (t) => {
  const f = await fixture(t);
  const visit = await f.start();
  const closed = await closeShoppingSession(f.user, visit.id, visit.revision);
  assert.equal(closed.status, "closed");
  assert.equal(closed.items[0]?.status, "open");
  assert.equal(closed.items[0]?.purchasedQuantity, 0);
  assert.equal(await f.quantity(), 0);
  const need = await db.shoppingItem.findUniqueOrThrow({ where: { id: f.requirement.id } });
  assert.equal(need.status, "OPEN");
  assert.equal(await db.stockPurchase.count({ where: { householdId: f.home.id } }), 0);
});

it("an unbought suggestion can be fulfilled by a different product and a different retailer", options, async (t) => {
  const f = await fixture(t);
  const otherShop = await db.shop.create({
    data: { householdId: f.home.id, name: "Other retailer", type: "SUPERMARKET" },
  });
  const replacement = await db.product.create({
    data: { householdId: f.home.id, name: "Different brand chicken", category: "MEAT_FISH", unit: "pak", defaultShopId: otherShop.id },
  });
  const replacementStock = await db.stockItem.create({
    data: { householdId: f.home.id, productId: replacement.id, placeId: f.stock.placeId, quantity: 0, unit: "pak" },
  });
  let visit = await f.start();
  const id = visit.items[0]!.id;
  visit = await updateShoppingSessionItem(f.user, visit.id, id, {
    revision: 0,
    operationId: "substitute-product",
    productId: replacement.id,
  });
  assert.equal(visit.items[0]?.productId, replacement.id);
  assert.deepEqual(visit.items[0]?.requirementIds, [f.requirement.id]);
  assert.equal(await f.quantity(), 0);
  visit = await updateShoppingSessionItem(f.user, visit.id, id, {
    revision: visit.items[0]!.revision,
    operationId: "buy-replacement",
    status: "bought",
  });
  assert.equal(visit.items[0]?.status, "bought");
  assert.equal(await f.quantity(), 0);
  assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: replacementStock.id } })).quantity.toNumber(), 2);
  await assert.rejects(
    updateShoppingSessionItem(f.user, visit.id, id, {
      revision: visit.items[0]!.revision,
      operationId: "switch-after-buy",
      productId: f.product.id,
    }),
    /already has purchases/,
  );
});

it("a receipt's actual store overrides a planned store without duplicate acquisition", options, async (t) => {
  const f = await fixture(t);
  const physicalShop = await db.shop.create({
    data: { householdId: f.home.id, name: "Store actually visited", type: "SUPERMARKET" },
  });
  let visit = await f.start();
  visit = await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, {
    revision: 0, operationId: "actual-purchase", status: "bought",
  });
  const acquired = await db.stockPurchase.findFirstOrThrow({
    where: { householdId: f.home.id, sessionItemId: visit.items[0]!.id },
  });
  assert.equal(acquired.shopId, f.shop.id);
  const doc = await f.receipt("physical-other-shop");
  visit = await attachShoppingReceipt(f.user, visit.id, {
    documentId: doc.id,
    purchasedAt: new Date().toISOString(),
    shopId: physicalShop.id,
  });
  const receiptId = visit.purchases[0]!.receipts[0]!.id;
  const line = {
    reference: "physical-line-1",
    sessionItemId: visit.items[0]!.id,
    quantity: 2,
    existingPurchaseIds: [acquired.id],
    acceptDifference: false,
  };
  await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, line);
  await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, line);
  const now = await db.stockPurchase.findUniqueOrThrow({ where: { id: acquired.id } });
  assert.equal(now.shopId, physicalShop.id);
  assert.equal(now.shopConfirmed, true);
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockPurchase.count({ where: { householdId: f.home.id } }), 1);
});

it("removing an unfinished visit hides it but preserves its needs, receipt, acquisition and payment history", options, async (t) => {
  const f = await fixture(t);
  let visit = await f.start();
  visit = await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, {
    revision: 0,
    operationId: "remove-fixture-buy",
    purchasedQuantity: 1,
    status: "bought",
  });
  assert.equal(visit.items[0]?.status, "open"); // still one suggested pack left
  const file = await f.receipt("remove-fixture-historic-receipt");
  visit = await attachShoppingReceipt(f.user, visit.id, {
    documentId: file.id,
    purchasedAt: new Date().toISOString(),
    totalCents: 599,
  });
  const original = await db.shoppingPurchase.findFirstOrThrow({ where: { sessionId: visit.id } });
  const before = await db.stockPurchase.count({ where: { shoppingPurchaseId: original.id } });
  assert.equal(before, 1);
  await deleteShoppingSession(f.user, visit.id, visit.revision);
  assert.equal((await listShoppingSessions(f.user)).some((row) => row.id === visit.id), false);
  await assert.rejects(getShoppingSession(f.user, visit.id), /not found/);
  await assert.rejects(
    updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, {
      revision: visit.items[0]!.revision, operationId: "removed-update", status: "bought",
    }),
    /not found/,
  );
  assert.equal(await f.quantity(), 1);
  assert.equal(await db.shoppingPurchase.count({ where: { id: original.id } }), 1);
  assert.equal(await db.shoppingReceipt.count({ where: { purchaseId: original.id } }), 1);
  assert.equal(await db.stockPurchase.count({ where: { shoppingPurchaseId: original.id } }), 1);
  const need = await db.shoppingItem.findUniqueOrThrow({ where: { id: f.requirement.id } });
  assert.equal(need.status, "OPEN");
  await deleteShoppingSession(f.user, visit.id, visit.revision); // duplicate retry
  await assert.rejects(closeShoppingSession(f.user, visit.id, visit.revision), /not found/);
});

it("receipt matching reuses pre-session goods from another shop with no second stock credit", options, async (t) => {
  const f = await fixture(t);
  const planned = await db.shop.create({ data: {
    householdId: f.home.id, name: "Collect & Go", type: "SUPERMARKET",
  } });
  const actual = await db.shop.create({ data: {
    householdId: f.home.id, name: "Colruyt Diest", type: "SUPERMARKET",
  } });
  const old = await db.stockPurchase.create({ data: {
    householdId: f.home.id, stockItemId: f.stock.id, productId: f.product.id,
    shopId: planned.id, shopConfirmed: true, quantity: 2, unit: "pak",
    purchasedAt: new Date(), stockAdded: true, userId: f.user.id,
    shoppingItemId: f.requirement.id,
  } });
  await db.stockItem.update({ where: { id: f.stock.id }, data: { quantity: 2 } });
  let visit = await f.start();
  assert.ok(visit.availableAcquisitions.some((line) => line.id === old.id));
  const doc = await f.receipt("prior-manual-cross-shop");
  visit = await attachShoppingReceipt(f.user, visit.id, {
    documentId: doc.id, purchasedAt: new Date().toISOString(), shopId: actual.id,
  });
  await reconcileShoppingReceiptLine(f.user, visit.id, visit.purchases[0]!.receipts[0]!.id, {
    reference: "on-paper-1", sessionItemId: visit.items[0]!.id,
    quantity: 2, existingPurchaseIds: [old.id], acceptDifference: false,
  });
  const linked = await db.stockPurchase.findUniqueOrThrow({ where: { id: old.id } });
  assert.equal(linked.shopId, actual.id);
  assert.equal(linked.sessionItemId, visit.items[0]!.id);
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockPurchase.count({ where: { householdId: f.home.id } }), 1);
});
