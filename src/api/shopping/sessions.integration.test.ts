import { HttpError } from "../lib/http";
import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "../lib/db";
import {
  getItem,
  listItems,
  updateItem,
  markOpenItemsBought,
} from "./shopping.service";
import {
  addShoppingSessionItem,
  attachShoppingReceipt,
  closeShoppingSession,
  createShoppingSession,
  getShoppingSession,
  joinShoppingSession,
  reconcileShoppingReceiptLine,
  updateShoppingSessionItem,
} from "./sessions.service";

import { shoppingSessionFixture as fixture } from "./sessions-test-helpers";

import { updateShoppingItem } from "./shopping-actions";

const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => {
  if (enabled) await db.$disconnect();
});

it(
  "essential minimum product is acquired once by two simultaneous participants, without resurfacing",
  options,
  async (t) => {
    const f = await fixture(t);
    const visit = await f.start();
    const item = visit.items[0]!;
    const participant = await db.user.create({
      data: {
        householdId: f.home.id,
        email: `${f.home.id}-cindy@example.test`,
        passwordHash: "test",
        role: "ADULT",
      },
    });
    const other = { ...f.user, id: participant.id, name: "Cindy" };
    await joinShoppingSession(other, visit.id);
    await Promise.all([
      updateShoppingSessionItem(f.user, visit.id, item.id, {
        revision: 0,
        operationId: "phone-1",
        status: "bought",
      }),
      updateShoppingSessionItem(other, visit.id, item.id, {
        revision: 0,
        operationId: "phone-2",
        status: "bought",
      }),
    ]);
    assert.equal(await f.quantity(), 2);
    assert.equal(
      await db.stockMovement.count({
        where: { householdId: f.home.id, reason: "BOUGHT" },
      }),
      1,
    );
    assert.equal(
      await db.stockPurchase.count({ where: { householdId: f.home.id } }),
      1,
    );
    assert.equal((await listItems(f.home.id, { status: "open" })).length, 0);
    assert.equal(
      (await getShoppingSession(f.user, visit.id)).participants.length,
      2,
    );
  },
);

it(
  "only chosen requirements enter a visit; partial purchases and skip never buy the rest",
  options,
  async (t) => {
    const f = await fixture(t);
    const empty = await createShoppingSession(f.user, {
      name: "Empty selection",
      shopIds: [],
      requirementIds: [],
      includeLowStock: false,
    });
    assert.equal(empty.items.length, 0);
    let visit = await f.start();
    let item = visit.items[0]!;
    visit = await updateShoppingSessionItem(f.user, visit.id, item.id, {
      revision: item.revision,
      operationId: "partial",
      purchasedQuantity: 1,
      status: "bought",
    });
    item = visit.items[0]!;
    assert.equal(item.status, "open");
    assert.equal(await f.quantity(), 1);
    visit = await updateShoppingSessionItem(f.user, visit.id, item.id, {
      revision: item.revision,
      operationId: "skip",
      status: "skipped",
    });
    await closeShoppingSession(f.user, visit.id, visit.revision);
    assert.equal(await f.quantity(), 1);
    assert.equal(
      (
        await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } })
      ).minQuantity?.toNumber(),
      2,
    );
  },
);

it(
  "later receipts, identical uploads and repeated printed lines never credit bought stock twice",
  options,
  async (t) => {
    const f = await fixture(t);
    let visit = await f.start();
    const item = visit.items[0]!;
    visit = await updateShoppingSessionItem(f.user, visit.id, item.id, {
      revision: 0,
      operationId: "bought",
      status: "bought",
    });
    await closeShoppingSession(f.user, visit.id, visit.revision);
    const document = await f.receipt("same-receipt");
    const duplicate = await f.receipt("same-receipt");
    await attachShoppingReceipt(f.user, visit.id, {
      documentId: document.id,
      purchasedAt: new Date().toISOString(),
      totalCents: 999,
    });
    visit = await attachShoppingReceipt(f.user, visit.id, {
      documentId: duplicate.id,
      purchasedAt: new Date().toISOString(),
      totalCents: 999,
    });
    assert.equal(visit.purchases[0]!.receipts.length, 1);
    const receiptId = visit.purchases[0]!.receipts[0]!.id;
    const line = {
      reference: "1",
      sessionItemId: item.id,
      quantity: 2,
      acceptDifference: false,
    };
    await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, line);
    await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, line);
    assert.equal(await f.quantity(), 2);
    assert.equal(
      await db.stockMovement.count({ where: { householdId: f.home.id } }),
      1,
    );
  },
);

it(
  "receipt first can credit an unbought item, missing goods and explicit extra quantities once",
  options,
  async (t) => {
    const f = await fixture(t);
    let visit = await f.start();
    const document = await f.receipt();
    visit = await attachShoppingReceipt(f.user, visit.id, {
      documentId: document.id,
      purchasedAt: new Date().toISOString(),
    });
    const receiptId = visit.purchases[0]!.receipts[0]!.id;
    const item = visit.items[0]!;
    await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, {
      reference: "2",
      sessionItemId: item.id,
      quantity: 2,
      acceptDifference: false,
    });
    assert.equal(await f.quantity(), 2);
    visit = await getShoppingSession(f.user, visit.id);
    await updateShoppingSessionItem(f.user, visit.id, item.id, {
      revision: visit.items[0]!.revision,
      operationId: "late-tick",
      status: "bought",
    });
    assert.equal(await f.quantity(), 2);
    await addShoppingSessionItem(f.user, visit.id, {
      name: "Receipt-only product",
      quantity: 1,
    });
    visit = await getShoppingSession(f.user, visit.id);
    const missing = visit.items.find((row) => row.productId === null)!;
    await reconcileShoppingReceiptLine(f.user, visit.id, receiptId, {
      reference: "3",
      sessionItemId: missing.id,
      quantity: 1,
      acceptDifference: false,
    });
    assert.equal(
      await f.quantity(),
      2,
      "untracked goods do not change another product's stock",
    );
  },
);

it(
  "old acquisitions and distinct visits do not trigger a duplicate warning, but immutable source identity remains",
  options,
  async (t) => {
    const f = await fixture(t);
    let visit = await f.start();
    await db.stockPurchase.create({
      data: {
        householdId: f.home.id,
        stockItemId: f.stock.id,
        productId: f.product.id,
        quantity: 2,
        unit: "pak",
        purchasedAt: new Date("2026-10-16T14:49:00Z"),
        stockAdded: true,
        userId: f.user.id,
      },
    });
    visit = await updateShoppingSessionItem(
      f.user,
      visit.id,
      visit.items[0]!.id,
      { revision: 0, operationId: "november-visit", status: "bought" },
    );
    assert.equal(await f.quantity(), 2);
    await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, {
      revision: 0,
      operationId: "november-visit",
      status: "bought",
    });
    assert.equal(await f.quantity(), 2);
  },
);

it(
  "partial acquisition retries are idempotent and reused operation ids reject changed payloads",
  options,
  async (t) => {
    const f = await fixture(t);
    const visit = await f.start();
    const item = visit.items[0]!;
    const first = {
      revision: 0,
      operationId: "partial-stable",
      purchasedQuantity: 1,
      status: "bought" as const,
    };
    await updateShoppingSessionItem(f.user, visit.id, item.id, first);
    await updateShoppingSessionItem(f.user, visit.id, item.id, first);
    await assert.rejects(
      updateShoppingSessionItem(f.user, visit.id, item.id, {
        ...first,
        revision: 1,
        purchasedQuantity: 2,
      }),
      /operation id/,
    );
    assert.equal(await f.quantity(), 1);
    const current = await getShoppingSession(f.user, visit.id);
    const changes = await Promise.allSettled(
      [3, 4].map((quantity) =>
        updateShoppingSessionItem(f.user, visit.id, item.id, {
          revision: current.items[0]!.revision,
          operationId: `edit-${quantity}`,
          quantity,
        }),
      ),
    );
    assert.equal(
      changes.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      changes.filter((result) => result.status === "rejected").length,
      1,
    );
  },
);

it(
  "two receipts can match two partial acquisitions of the same product without adding either again",
  options,
  async (t) => {
    const f = await fixture(t);
    let visit = await f.start();
    const item = visit.items[0]!;
    for (const index of [1, 2]) {
      visit = await getShoppingSession(f.user, visit.id);
      visit = await updateShoppingSessionItem(f.user, visit.id, item.id, {
        revision: visit.items[0]!.revision,
        operationId: `part-${index}`,
        status: "bought",
        purchasedQuantity: index,
      });
      const doc = await f.receipt(`receipt-${index}`);
      visit = await attachShoppingReceipt(f.user, visit.id, {
        documentId: doc.id,
        purchasedAt: new Date().toISOString(),
      });
      const receipt = visit.purchases[0]!.receipts.find(
        (receipt) => receipt.documentId === doc.id,
      )!;
      await reconcileShoppingReceiptLine(f.user, visit.id, receipt.id, {
        reference: "1",
        sessionItemId: item.id,
        quantity: 1,
        acceptDifference: false,
      });
    }
    assert.equal(await f.quantity(), 2);
    assert.equal(
      await db.stockMovement.count({
        where: { householdId: f.home.id, stockPurchaseId: { not: null } },
      }),
      2,
    );
  },
);

it(
  "legacy shared lists reject stale quantity edits and concurrent ticks still credit one acquisition",
  options,
  async (t) => {
    const f = await fixture(t);
    const item = await getItem(f.home.id, f.requirement.id);
    await updateItem(f.user, item.id, {
      quantity: 3,
      expectedUpdatedAt: item.updatedAt,
    });
    await assert.rejects(
      updateItem(f.user, item.id, {
        quantity: 4,
        expectedUpdatedAt: item.updatedAt,
      }),
      /Someone changed/,
    );
    const fresh = await getItem(f.home.id, item.id);
    await Promise.all([
      updateShoppingItem(f.user, item.id, {
        status: "bought",
        expectedUpdatedAt: fresh.updatedAt,
      }),
      updateShoppingItem(f.user, item.id, {
        status: "bought",
        expectedUpdatedAt: fresh.updatedAt,
      }),
    ]);
    assert.equal(await f.quantity(), 3);
    assert.equal(
      await db.stockPurchase.count({ where: { householdId: f.home.id } }),
      1,
    );
  },
);

it(
  "starting a visit is retry-safe and contains only selected products",
  options,
  async (t) => {
    const f = await fixture(t);
    const other = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Unselected bread",
        unit: "pak",
        category: "BAKERY",
      },
    });
    await db.shoppingItem.create({
      data: {
        householdId: f.home.id,
        listId: f.requirement.listId,
        productId: other.id,
        name: other.name,
        source: "MANUAL",
      },
    });
    const input = {
      operationId: "start-stable",
      name: "Selected visit",
      shopIds: [f.shop.id],
      requirementIds: [f.requirement.id],
      includeLowStock: true,
    };
    const [first, retry] = await Promise.all([
      createShoppingSession(f.user, input),
      createShoppingSession(f.user, input),
    ]);
    assert.equal(first.id, retry.id);
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0]?.productId, f.product.id);
    assert.equal(
      await db.shoppingSession.count({ where: { householdId: f.home.id } }),
      1,
    );
    await assert.rejects(
      createShoppingSession(f.user, { ...input, name: "Different request" }),
      /different visit/,
    );
  },
);

it(
  "distinct product types and container variants cannot silently merge existing stock",
  options,
  async (t) => {
    const f = await fixture(t);
    const { linkAlternative } = await import("./shopping.service");
    const spread = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Bertolli smeerboter met olijfolie",
        unit: "potje",
        category: "DAIRY",
        packageAmount: 250,
        packageUnit: "g",
      },
    });
    const oil = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Olijfolie",
        unit: "fles",
        category: "PANTRY",
        packageAmount: 1,
        packageUnit: "l",
      },
    });
    const jar = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Tomatenpuree potje",
        unit: "potje",
        category: "PANTRY",
      },
    });
    const tube = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Tomatenpuree tube",
        unit: "tube",
        category: "PANTRY",
      },
    });
    const stored = await db.stockItem.create({
      data: {
        householdId: f.home.id,
        productId: jar.id,
        placeId: f.stock.placeId,
        quantity: 10,
        unit: "potje",
      },
    });
    await assert.rejects(
      linkAlternative(f.user, spread.id, { mainProductId: oil.id }),
      (error: unknown) =>
        error instanceof HttpError &&
        /different product|types\/categories/.test(
          error.fields?.mainProductId?.join(" ") ?? "",
        ),
    );
    await assert.rejects(
      linkAlternative(f.user, jar.id, { mainProductId: tube.id }),
      (error: unknown) =>
        error instanceof HttpError &&
        /distinct containers/.test(
          error.fields?.mainProductId?.join(" ") ?? "",
        ),
    );
    assert.equal(
      (
        await db.stockItem.findUniqueOrThrow({ where: { id: stored.id } })
      ).quantity.toNumber(),
      10,
    );
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: jar.id } }))
        .stockProductId,
      null,
    );
  },
);

it(
  "a later receipt can credit previously untracked goods once while preserving the original acquisition",
  options,
  async (t) => {
    const f = await fixture(t);
    let visit = await f.start();
    const product = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Newly tracked jars",
        unit: "potje",
        category: "PANTRY",
      },
    });
    visit = await addShoppingSessionItem(f.user, visit.id, {
      productId: product.id,
      quantity: 3,
    });
    const item = visit.items.find((line) => line.productId === product.id)!;
    visit = await updateShoppingSessionItem(f.user, visit.id, item.id, {
      revision: 0,
      operationId: "untracked-buy",
      status: "bought",
    });
    const original = await db.stockPurchase.findFirstOrThrow({
      where: { householdId: f.home.id, sessionItemId: item.id },
    });
    assert.equal(original.stockAdded, false);
    const stock = await db.stockItem.create({
      data: {
        householdId: f.home.id,
        productId: product.id,
        placeId: f.stock.placeId,
        quantity: 0,
        unit: "potje",
      },
    });
    const document = await f.receipt();
    visit = await attachShoppingReceipt(f.user, visit.id, {
      documentId: document.id,
      purchasedAt: new Date().toISOString(),
    });
    const receipt = visit.purchases[0]!.receipts[0]!;
    const line = {
      reference: "1",
      sessionItemId: item.id,
      quantity: 3,
      stockItemId: stock.id,
      acceptDifference: false,
    };
    await reconcileShoppingReceiptLine(f.user, visit.id, receipt.id, line);
    await reconcileShoppingReceiptLine(f.user, visit.id, receipt.id, line);
    assert.equal(
      (
        await db.stockItem.findUniqueOrThrow({ where: { id: stock.id } })
      ).quantity.toNumber(),
      3,
    );
    assert.equal(
      await db.stockPurchase.count({
        where: { householdId: f.home.id, sessionItemId: item.id },
      }),
      1,
    );
    assert.equal(
      (await db.stockPurchase.findUniqueOrThrow({ where: { id: original.id } }))
        .stockAdded,
      true,
    );
    assert.equal(
      await db.stockMovement.count({ where: { stockPurchaseId: original.id } }),
      1,
    );
  },
);

it(
  "a recipe-only visit excludes the automatic quantity contribution and leaves original requirements intact",
  options,
  async (t) => {
    const f = await fixture(t);
    const recipe = await db.shoppingItem.create({
      data: {
        householdId: f.home.id,
        listId: f.requirement.listId,
        productId: f.product.id,
        name: f.product.name,
        quantity: 1,
        unit: "pak",
        source: "RECIPE",
        mealPlanEntryId: "retained-meal-reference",
      },
    });
    const visit = await createShoppingSession(f.user, {
      name: "Recipe only",
      shopIds: [f.shop.id],
      requirementIds: [recipe.id],
      includeLowStock: false,
    });
    assert.equal(visit.items[0]?.quantity, 1);
    assert.deepEqual(visit.items[0]?.requirementIds, [recipe.id]);
    await updateShoppingSessionItem(
      f.user,
      visit.id,
      visit.items[0]!.id,
      { revision: 0, operationId: "recipe-buy", status: "bought" },
    );
    assert.equal(await f.quantity(), 1);
    assert.equal(
      (await listItems(f.home.id, { status: "open" })).length,
      0,
      "minimum is still unmet but cannot reappear in this visit",
    );
    const retained = await db.shoppingItem.findUniqueOrThrow({
      where: { id: recipe.id },
    });
    assert.equal(retained.quantity.toNumber(), 1);
    assert.equal(retained.mealPlanEntryId, "retained-meal-reference");
    assert.equal(
      (
        await db.stockItem.findUniqueOrThrow({ where: { id: f.stock.id } })
      ).minQuantity?.toNumber(),
      2,
    );
  },
);

it(
  "bulk trip check-off and a shared-stock alternative cannot resurrect a low-stock row",
  options,
  async (t) => {
    const f = await fixture(t);
    const alternative = await db.product.create({
      data: {
        householdId: f.home.id,
        name: "Alternative milk",
        unit: "pak",
        category: "MEAT_FISH",
        stockProductId: f.product.id,
      },
    });
    const explicit = await db.shoppingItem.create({
      data: {
        householdId: f.home.id,
        listId: f.requirement.listId,
        productId: alternative.id,
        name: alternative.name,
        source: "MANUAL",
        quantity: 2,
        unit: "pak",
      },
    });
    await updateShoppingItem(f.user, explicit.id, { status: "bought" });
    assert.equal((await listItems(f.home.id, { status: "open" })).length, 0);
    assert.equal(await f.quantity(), 2);
    await db.product.update({
      where: { id: f.product.id },
      data: { shoppingRestockState: "ACTIVE" },
    });
    const next = await db.shoppingItem.create({
      data: {
        householdId: f.home.id,
        listId: f.requirement.listId,
        productId: f.product.id,
        name: f.product.name,
        source: "LOW_STOCK",
        quantity: 2,
        unit: "pak",
      },
    });
    await markOpenItemsBought(f.user, [next.listId]);
    assert.equal((await listItems(f.home.id, { status: "open" })).length, 0);
    assert.equal(
      await f.quantity(),
      2,
      "bulk check-off alone never invents a second stock acquisition",
    );
  },
);

it(
  "household counts jars without a package weight despite a stale catalogue label",
  options,
  async (t) => {
    const f = await fixture(t);
    await db.product.update({
      where: { id: f.product.id },
      data: {
        name: "Tomatenpuree",
        unit: "tube",
        packageAmount: null,
        packageUnit: null,
      },
    });
    await db.stockItem.update({
      where: { id: f.stock.id },
      data: { quantity: 10, minQuantity: 0, unit: "potje" },
    });
    const { createItem, getProduct } = await import("./shopping.service");
    assert.equal((await getProduct(f.home.id, f.product.id)).unit, "potje");
    const requirement = await createItem(f.user, {
      productId: f.product.id,
      source: "manual",
      quantity: 1,
    });
    assert.equal(requirement.unit, "potje");
    const visit = await createShoppingSession(f.user, {
      name: "Een potje erbij",
      shopIds: [f.shop.id],
      requirementIds: [requirement.id],
      includeLowStock: false,
    });
    const item = visit.items[0]!;
    assert.equal(item.unit, "potje");
    await updateShoppingSessionItem(f.user, visit.id, item.id, {
      revision: item.revision,
      operationId: "one-jar",
      status: "bought",
    });
    assert.equal(await f.quantity(), 11);
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: f.product.id } }))
        .packageAmount,
      null,
    );
    const extra = await addShoppingSessionItem(f.user, visit.id, {
      productId: f.product.id,
      quantity: 1,
    });
    assert.equal(extra.items[0]?.unit, "potje");
  },
);
