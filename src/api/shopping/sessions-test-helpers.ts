import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { db } from "../lib/db";
import type { SessionUser } from "@/features/auth/types/auth";
import { createShoppingSession } from "./sessions.service";

export async function shoppingSessionFixture(t: TestContext) {
  assert.match(
    new URL(process.env.DATABASE_URL!).pathname,
    /(?:test|ci)$/i,
    "Integration tests require an explicitly named disposable test database",
  );
  const home = await db.household.create({
    data: { name: "Shopping integration fixture" },
  });
  t.after(async () => {
    await db.household.delete({ where: { id: home.id } });
  });
  const account = await db.user.create({
    data: {
      householdId: home.id,
      email: `${home.id}@example.test`,
      passwordHash: "test-only",
      role: "ADULT",
    },
  });
  const user: SessionUser = {
    id: account.id,
    householdId: home.id,
    role: "adult",
    locale: "nl",
    email: account.email,
    name: "Rob",
    habitantId: null,
    householdName: home.name,
  };
  const floor = await db.floor.create({
    data: {
      householdId: home.id,
      name: "Test floor",
      level: 0,
      kind: "INDOOR",
    },
  });
  const place = await db.place.create({
    data: {
      householdId: home.id,
      floorId: floor.id,
      name: "Test pantry",
      kind: "ROOM",
      color: "#000000",
    },
  });
  const shop = await db.shop.create({
    data: { householdId: home.id, name: "Test Colruyt", type: "SUPERMARKET" },
  });
  const product = await db.product.create({
    data: {
      householdId: home.id,
      name: "Boni chicken filet",
      category: "MEAT_FISH",
      unit: "pak",
      isEssential: true,
      defaultShopId: shop.id,
    },
  });
  const stock = await db.stockItem.create({
    data: {
      householdId: home.id,
      productId: product.id,
      placeId: place.id,
      quantity: 0,
      minQuantity: 2,
      unit: "pak",
    },
  });
  const list = await db.shoppingList.create({
    data: {
      householdId: home.id,
      name: "Groceries",
      kind: "GROCERIES",
      defaultSource: "LOW_STOCK",
    },
  });
  const requirement = await db.shoppingItem.create({
    data: {
      householdId: home.id,
      listId: list.id,
      productId: product.id,
      name: product.name,
      source: "LOW_STOCK",
      quantity: 2,
      unit: "pak",
      shopId: shop.id,
    },
  });
  const start = () =>
    createShoppingSession(user, {
      name: "Visit",
      shopIds: [shop.id],
      requirementIds: [requirement.id],
      includeLowStock: true,
    });
  const quantity = async () =>
    (
      await db.stockItem.findUniqueOrThrow({ where: { id: stock.id } })
    ).quantity.toNumber();
  const receipt = async (hash: string = crypto.randomUUID()) =>
    db.documentFile.create({
      data: {
        householdId: home.id,
        name: "receipt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        sha256: hash,
        uploadedAt: new Date(),
      },
    });
  return {
    user,
    home,
    product,
    stock,
    requirement,
    shop,
    start,
    quantity,
    receipt,
  };
}
