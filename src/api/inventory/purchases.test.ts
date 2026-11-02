import { actor, setup } from "./purchases-test-helpers";
import assert from "node:assert/strict";
import { it } from "node:test";
import { stockPurchaseInputSchema, type StockPurchaseInput } from "@/features/inventory/types/purchases";
import { HttpError } from "../lib/http";
import { applyPurchaseChange, setStockCount } from "./inventory.service";
import { purchaseReview, recordStockPurchase } from "./purchases.service";

const scan = (reference: string, quantity = 1): StockPurchaseInput => ({ quantity, source: { kind: "scan", reference } });
const receipt = (documentId = "doc-a", shopId = "a", quantity = 1): StockPurchaseInput => ({ quantity, source: { kind: "receipt", reference: "line-1", documentId }, purchasedAt: new Date(Date.now() - 60_000).toISOString(), shopId });
const reviewError = (error: unknown) => error instanceof HttpError && error.code === "purchase_review";

it("posts an acquisition and its evidence once, including concurrent retries", async (t) => {
  const { read, locks } = setup(t);
  const results = await Promise.all([recordStockPurchase(actor, "stock", scan("one", 2)), recordStockPurchase(actor, "stock", scan("one", 2))]);
  assert.equal(read().stock.quantity.toNumber(), 4); assert.equal(read().movements.length, 1); assert.equal(read().purchases.length, 1); assert.equal(read().evidence.length, 1);
  assert.deepEqual(results.map((entry) => entry.purchase?.added), [2, 0]);
  assert.ok(locks.mock.calls.some((call) => String(call.arguments[0]).includes("pg_advisory_xact_lock")));
  assert.ok(locks.mock.calls.some((call) => String(call.arguments[0]).includes("FOR UPDATE")));
});
it("a changed quantity on the same source cannot add stock again", async (t) => {
  const { read } = setup(t); await recordStockPurchase(actor, "stock", scan("one"));
  await assert.rejects(recordStockPurchase(actor, "stock", scan("one", 2)), /already recorded/); assert.equal(read().stock.quantity.toNumber(), 3);
});
it("a tick then a scan requires same/extra; confirming same adds nothing", async (t) => {
  const { read } = setup(t);
  const tick = await applyPurchaseChange(actor, "stock", { ...scan("tick", 3), sourceKey: "shopping:row", shoppingItemId: "row", shoppingMemberIds: ["row"] });
  await assert.rejects(recordStockPurchase(actor, "stock", scan("scan")), reviewError);
  const linked = await recordStockPurchase(actor, "stock", { ...scan("scan"), existingPurchaseIds: tick.purchase!.purchaseIds });
  assert.equal(linked.purchase?.added, 0); assert.equal(read().stock.quantity.toNumber(), 5); assert.equal(read().movements.length, 1);
});
it("scanning first then ticking cannot credit the same goods silently", async (t) => {
  const { read } = setup(t); const scanned = await recordStockPurchase(actor, "stock", scan("first"));
  const tick = { ...scan("tick"), source: { kind: "manual" as const, reference: "tick" }, sourceKey: "shopping:row", shoppingItemId: "row", shoppingMemberIds: ["row"] };
  await assert.rejects(applyPurchaseChange(actor, "stock", tick), reviewError);
  await applyPurchaseChange(actor, "stock", { ...tick, existingPurchaseIds: scanned.purchase!.purchaseIds });
  await applyPurchaseChange(actor, "stock", tick); // untick/re-tick
  assert.equal(read().stock.quantity.toNumber(), 3); assert.equal(read().purchases.length, 1);
});
it("two shops and two receipts keep two real acquisitions and never credit receipts again", async (t) => {
  const { read } = setup(t);
  const first = await recordStockPurchase(actor, "stock", { ...scan("a"), shopId: "a" });
  const second = await recordStockPurchase(actor, "stock", { ...scan("b", 2), shopId: "b", separatePurchaseConfirmed: true });
  await recordStockPurchase(actor, "stock", { ...receipt("doc-a"), existingPurchaseIds: first.purchase!.purchaseIds });
  await recordStockPurchase(actor, "stock", { ...receipt("doc-b", "b", 2), existingPurchaseIds: second.purchase!.purchaseIds });
  await recordStockPurchase(actor, "stock", { ...receipt("doc-copy"), existingPurchaseIds: first.purchase!.purchaseIds });
  assert.equal(read().stock.quantity.toNumber(), 5); assert.equal(read().movements.length, 2); assert.equal(read().purchases.length, 2);
});
it("a receipt line can reconcile several earlier scans with an exact total", async (t) => {
  const { read } = setup(t);
  const first = await recordStockPurchase(actor, "stock", scan("one"));
  const second = await recordStockPurchase(actor, "stock", { ...scan("two"), separatePurchaseConfirmed: true });
  await recordStockPurchase(actor, "stock", { ...receipt("doc-a", "a", 2), existingPurchaseIds: [...first.purchase!.purchaseIds, ...second.purchase!.purchaseIds] });
  assert.equal(read().stock.quantity.toNumber(), 4); assert.equal(read().evidence.length, 3);
});
it("different receipt photos require reconciliation; the same purchase cannot cover two different receipts", async (t) => {
  const { read } = setup(t); const first = await recordStockPurchase(actor, "stock", receipt());
  await assert.rejects(recordStockPurchase(actor, "stock", receipt("doc-other")), reviewError);
  await assert.rejects(recordStockPurchase(actor, "stock", { ...receipt("doc-other"), existingPurchaseIds: first.purchase!.purchaseIds }), /receipt is already linked/);
  assert.equal(read().stock.quantity.toNumber(), 3);
});
it("an older receipt after a count asks whether it was included, even if the count was unchanged", async (t) => {
  const { read } = setup(t);
  await setStockCount(actor, "stock", { quantity: 2, expectedUpdatedAt: read().stock.updatedAt.toISOString() });
  assert.ok(read().stock.lastCountedAt); assert.equal(read().movements.length, 0);
  await assert.rejects(recordStockPurchase(actor, "stock", receipt()), (error: unknown) => error instanceof HttpError && error.code === "purchase_count_review");
  const result = await recordStockPurchase(actor, "stock", { ...receipt(), countDisposition: "already_counted" });
  assert.equal(result.purchase?.added, 0); assert.equal(read().stock.quantity.toNumber(), 2); assert.equal(read().purchases[0]?.stockAdded, false);
});
it("goods explicitly excluded from a count can still be added once", async (t) => {
  const { read } = setup(t); await setStockCount(actor, "stock", { quantity: 0, expectedUpdatedAt: read().stock.updatedAt.toISOString() });
  await recordStockPurchase(actor, "stock", { ...receipt(), countDisposition: "add_after_count" });
  await recordStockPurchase(actor, "stock", receipt()); assert.equal(read().stock.quantity.toNumber(), 1);
});
it("mismatched receipt quantities and another shop cannot be linked", async (t) => {
  const { read } = setup(t); const first = await recordStockPurchase(actor, "stock", { ...scan("one"), shopId: "a" });
  await assert.rejects(recordStockPurchase(actor, "stock", { ...receipt("doc-a", "a", 2), existingPurchaseIds: first.purchase!.purchaseIds }), /quantities differ/);
  await assert.rejects(recordStockPurchase(actor, "stock", { ...receipt("doc-a", "b"), existingPurchaseIds: first.purchase!.purchaseIds }), /do not belong/);
  assert.equal(read().evidence.length, 1); assert.equal(read().stock.quantity.toNumber(), 3);
});
it("cannot read/link another household's stock, shop, receipt or acquisition", async (t) => {
  const { foreign, read } = setup(t); foreign();
  await assert.rejects(purchaseReview("other", "stock"), /not found/);
  await assert.rejects(recordStockPurchase({ ...actor, householdId: "other" }, "stock", scan("one")), /not found/);
  await assert.rejects(recordStockPurchase(actor, "stock", { ...scan("one"), shopId: "unknown" }), /not found/);
  await assert.rejects(recordStockPurchase(actor, "stock", { ...receipt("unknown") }), /Upload the receipt/);
  await assert.rejects(recordStockPurchase(actor, "stock", { ...scan("one"), existingPurchaseIds: ["foreign"] }), /do not belong/);
  assert.equal(read().movements.length, 0);
});
it("rolls back purchase/evidence if the stock movement fails", async (t) => {
  const { read, fail } = setup(t); fail();
  await assert.rejects(recordStockPurchase(actor, "stock", scan("one")), /movement failed/);
  assert.equal(read().stock.quantity.toNumber(), 2); assert.equal(read().purchases.length, 0); assert.equal(read().evidence.length, 0);
});
it("validates purchase sources and refuses a future receipt date", async (t) => {
  setup(t);
  assert.equal(stockPurchaseInputSchema.safeParse({ quantity: 1, source: { kind: "receipt", reference: "1" } }).success, false);
  assert.equal(stockPurchaseInputSchema.safeParse({ quantity: 0, source: { kind: "scan", reference: "" } }).success, false);
  await assert.rejects(recordStockPurchase(actor, "stock", { ...receipt(), purchasedAt: new Date(Date.now() + 86_400_000).toISOString() }), /future/);
});


it("does not assume goods are new merely because the prior acquisition is older than a week", async (t) => {
  const { read } = setup(t);
  await recordStockPurchase(actor, "stock", scan("old"));
  read().purchases[0]!.purchasedAt = new Date(Date.now() - 30 * 86_400_000);
  await assert.rejects(recordStockPurchase(actor, "stock", scan("later-scan")), reviewError);
  assert.equal(read().stock.quantity.toNumber(), 3);
});
