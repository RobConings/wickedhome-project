import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "../lib/db";
import { listItems } from "./shopping.service";
import { addShoppingSessionItem, attachShoppingReceipt, closeShoppingSession, createShoppingSession, getShoppingSession, joinShoppingSession, reconcileShoppingReceiptLine, updateShoppingSessionItem } from "./sessions.service";

import { shoppingSessionFixture as fixture } from "./sessions-test-helpers";

const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => { if (enabled) await db.$disconnect(); });

it("essential minimum product is acquired once by two simultaneous participants, without resurfacing", options, async (t) => {
  const f = await fixture(t); const visit = await f.start(); const item = visit.items[0]!;
  const participant = await db.user.create({ data: { householdId: f.home.id, email: `${f.home.id}-cindy@example.test`, passwordHash: "test", role: "ADULT" } });
  const other = { ...f.user, id: participant.id, name: "Cindy" };
  await joinShoppingSession(other, visit.id);
  await Promise.all([updateShoppingSessionItem(f.user, visit.id, item.id, { revision: 0, operationId: "phone-1", status: "bought" }), updateShoppingSessionItem(other, visit.id, item.id, { revision: 0, operationId: "phone-2", status: "bought" })]);
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id, reason: "BOUGHT" } }), 1);
  assert.equal(await db.stockPurchase.count({ where: { householdId: f.home.id } }), 1);
  assert.equal((await listItems(f.home.id, { status: "open" })).length, 0);
  assert.equal((await getShoppingSession(f.user, visit.id)).participants.length, 2);
});

it("only chosen requirements enter a visit; partial purchases and skip never buy the rest", options, async (t) => {
  const f = await fixture(t);
  const empty = await createShoppingSession(f.user, { name: "Empty selection", shopIds: [], requirementIds: [], includeLowStock: false });
  assert.equal(empty.items.length, 0);
  let visit = await f.start(); let item = visit.items[0]!;
  visit = await updateShoppingSessionItem(f.user, visit.id, item.id, { revision: item.revision, operationId: "partial", purchasedQuantity: 1, status: "bought" });
  item = visit.items[0]!; assert.equal(item.status, "open"); assert.equal(await f.quantity(), 1);
  visit = await updateShoppingSessionItem(f.user, visit.id, item.id, { revision: item.revision, operationId: "skip", status: "skipped" });
  await closeShoppingSession(f.user, visit.id, visit.revision);
  assert.equal(await f.quantity(), 1);
  assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } })).minQuantity?.toNumber(), 2);
});

it("later receipts, identical uploads and repeated printed lines never credit bought stock twice", options, async (t) => {
  const f = await fixture(t); let visit = await f.start(); const item = visit.items[0]!;
  visit = await updateShoppingSessionItem(f.user, visit.id, item.id, { revision: 0, operationId: "bought", status: "bought" });
  await closeShoppingSession(f.user, visit.id, visit.revision);
  const document = await f.receipt("same-receipt"); const duplicate = await f.receipt("same-receipt");
  await attachShoppingReceipt(f.user, visit.id, { documentId: document.id, purchasedAt: new Date().toISOString(), totalCents: 999 });
  visit = await attachShoppingReceipt(f.user, visit.id, { documentId: duplicate.id, purchasedAt: new Date().toISOString(), totalCents: 999 });
  assert.equal(visit.purchases[0]!.receipts.length, 1);
  const receiptId = visit.purchases[0]!.receipts[0]!.id;
  const line = { reference: "1", sessionItemId: item.id, quantity: 2, acceptDifference: false };
  await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, line);
  await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, line);
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id } }), 1);
});

it("receipt first can credit an unbought item, missing goods and explicit extra quantities once", options, async (t) => {
  const f = await fixture(t); let visit = await f.start(); const document = await f.receipt();
  visit = await attachShoppingReceipt(f.user, visit.id, { documentId: document.id, purchasedAt: new Date().toISOString() });
  const receiptId = visit.purchases[0]!.receipts[0]!.id; const item = visit.items[0]!;
  await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, { reference: "2", sessionItemId: item.id, quantity: 2, acceptDifference: false });
  assert.equal(await f.quantity(), 2);
  visit = await getShoppingSession(f.user, visit.id);
  await updateShoppingSessionItem(f.user, visit.id, item.id, { revision: visit.items[0]!.revision, operationId: "late-tick", status: "bought" });
  assert.equal(await f.quantity(), 2);
  await addShoppingSessionItem(f.user, visit.id, { name: "Receipt-only product", quantity: 1 });
  visit = await getShoppingSession(f.user, visit.id); const missing = visit.items.find((row) => row.productId === null)!;
  await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, { reference: "3", sessionItemId: missing.id, quantity: 1, acceptDifference: false });
  assert.equal(await f.quantity(), 2, "untracked goods do not change another product's stock");
});

it("old acquisitions and distinct visits do not trigger a duplicate warning, but immutable source identity remains", options, async (t) => {
  const f = await fixture(t); let visit = await f.start();
  await db.stockPurchase.create({ data: { householdId: f.home.id, stockItemId: f.stock.id, productId: f.product.id, quantity: 2, unit: "pak", purchasedAt: new Date("2026-10-16T14:49:00Z"), stockAdded: true, userId: f.user.id } });
  visit = await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, { revision: 0, operationId: "november-visit", status: "bought" });
  assert.equal(await f.quantity(), 2);
  await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, { revision: 0, operationId: "november-visit", status: "bought" });
  assert.equal(await f.quantity(), 2);
});


it("partial acquisition retries are idempotent and reused operation ids reject changed payloads", options, async (t) => {
  const f = await fixture(t); const visit = await f.start(); const item = visit.items[0]!;
  const first = { revision: 0, operationId: "partial-stable", purchasedQuantity: 1, status: "bought" as const };
  await updateShoppingSessionItem(f.user, visit.id, item.id, first);
  await updateShoppingSessionItem(f.user, visit.id, item.id, first);
  await assert.rejects(updateShoppingSessionItem(f.user, visit.id, item.id, { ...first, revision: 1, purchasedQuantity: 2 }), /operation id/);
  assert.equal(await f.quantity(), 1);
  const current = await getShoppingSession(f.user, visit.id);
  const changes = await Promise.allSettled([3, 4].map((quantity) => updateShoppingSessionItem(f.user, visit.id, item.id, { revision: current.items[0]!.revision, operationId: `edit-${quantity}`, quantity })));
  assert.equal(changes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(changes.filter((result) => result.status === "rejected").length, 1);
});

it("two receipts can match two partial acquisitions of the same product without adding either again", options, async (t) => {
  const f = await fixture(t); let visit = await f.start(); const item = visit.items[0]!;
  for (const index of [1, 2]) {
    visit = await getShoppingSession(f.user, visit.id);
    visit = await updateShoppingSessionItem(f.user, visit.id, item.id, { revision: visit.items[0]!.revision, operationId: `part-${index}`, status: "bought", purchasedQuantity: index });
    const doc = await f.receipt(`receipt-${index}`);
    visit = await attachShoppingReceipt(f.user, visit.id, { documentId: doc.id, purchasedAt: new Date().toISOString() });
    const receipt = visit.purchases[0]!.receipts.find((receipt) => receipt.documentId === doc.id)!;
    await reconcileShoppingReceiptLine(f.user, visit.id, receipt.id, { reference: "1", sessionItemId: item.id, quantity: 1, acceptDifference: false });
  }
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id, stockPurchaseId: { not: null } } }), 2);
});
