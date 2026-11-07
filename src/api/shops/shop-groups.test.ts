import assert from "node:assert/strict";
import { after, describe, it, type TestContext } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import { shopGroupInputSchema } from "@/features/shops/types/shops";
import { db } from "../lib/db";
import { errorHandler } from "../lib/http";
import { deleteShopGroup, listShopGroups, saveShopGroup } from "./shop-groups.service";
import { shopsRouter } from "./shops.routes";

function stub<T extends object, K extends keyof T, F extends (...args: never[]) => unknown>(t: TestContext, target: T, key: K, implementation: F) {
  const original: unknown = Reflect.get(target, key);
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => { Reflect.set(target, key, original); });
  return replacement;
}

type Row = { id: string; householdId: string; name: string; members: { shopId: string }[] };
function setup(t: TestContext) {
  const shops = [{ id: "colruyt", householdId: null }, { id: "collect", householdId: null }, { id: "okay", householdId: "h1" }, { id: "foreign", householdId: "h2" }];
  const rows: Row[] = [
    { id: "group", householdId: "h1", name: "Colruyt-groep", members: [{ shopId: "colruyt" }, { shopId: "collect" }] },
    { id: "foreign-group", householdId: "h2", name: "Private", members: [{ shopId: "foreign" }] },
  ];
  stub(t, db, "$transaction", async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  stub(t, db.shopGroup, "findMany", async ({ where }: { where: { householdId: string } }) => rows.filter((row) => row.householdId === where.householdId));
  stub(t, db.shopGroup, "findFirst", async ({ where }: { where: { id: string; householdId: string } }) => rows.find((row) => row.id === where.id && row.householdId === where.householdId) ?? null);
  stub(t, db.shop, "count", async ({ where }: { where: { id: { in: string[] }; OR: { householdId: string | null }[] } }) => shops.filter((shop) => where.id.in.includes(shop.id) && where.OR.some((scope) => scope.householdId === shop.householdId)).length);
  stub(t, db.shopGroup, "create", async ({ data }: { data: { householdId: string; name: string; members: { create: { shopId: string }[] } } }) => {
    if (rows.some((row) => row.householdId === data.householdId && row.name === data.name)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
    const row = { id: "new-group", householdId: data.householdId, name: data.name, members: data.members.create };
    rows.push(row); return row;
  });
  const update = stub(t, db.shopGroup, "update", async ({ where, data }: { where: { id: string; householdId: string }; data: { name: string; members: { create: { shopId: string }[] } } }) => {
    const row = rows.find((row) => row.id === where.id && row.householdId === where.householdId)!;
    row.name = data.name; row.members = data.members.create; return row;
  });
  stub(t, db.shopGroup, "deleteMany", async ({ where }: { where: { id: string; householdId: string } }) => {
    const index = rows.findIndex((row) => row.id === where.id && row.householdId === where.householdId);
    if (index < 0) return { count: 0 };
    rows.splice(index, 1); return { count: 1 };
  });
  return { rows, shops, update };
}

describe("saved shop groups", () => {
  it("requires a name and at least two different shops", () => {
    for (const input of [{ name: "", shopIds: ["a", "b"] }, { name: "Trip", shopIds: ["a"] }, { name: "Trip", shopIds: ["a", "a"] }]) {
      assert.equal(shopGroupInputSchema.safeParse(input).success, false);
    }
  });

  it("persists household groups, including built-in and household-owned shops", async (t) => {
    setup(t);
    const group = await saveShopGroup("h1", { name: "Trip", shopIds: ["colruyt", "collect", "okay"] });
    assert.deepEqual(group.shopIds, ["colruyt", "collect", "okay"]);
    assert.deepEqual((await listShopGroups("h1")).map((row) => row.name), ["Colruyt-groep", "Trip"]);
  });

  it("rejects another household's shop or group before changing saved members", async (t) => {
    const { rows, update } = setup(t);
    await assert.rejects(saveShopGroup("h1", { name: "Oops", shopIds: ["colruyt", "foreign"] }, "group"), /available to this household/);
    await assert.rejects(saveShopGroup("h1", { name: "Oops", shopIds: ["colruyt", "collect"] }, "foreign-group"), /not found/);
    assert.equal(update.mock.callCount(), 0);
    assert.equal(rows[0]!.name, "Colruyt-groep");
    await assert.rejects(deleteShopGroup("h1", "foreign-group"), /not found/);
    assert.equal(rows.length, 2);
  });

  it("replaces a group's members, and deletes only the group", async (t) => {
    const { rows, shops } = setup(t);
    const group = await saveShopGroup("h1", { name: "Colruyt family", shopIds: ["colruyt", "okay"] }, "group");
    assert.deepEqual(group.shopIds, ["colruyt", "okay"]);
    await deleteShopGroup("h1", "group");
    assert.deepEqual(rows.map((row) => row.id), ["foreign-group"]);
    assert.equal(shops.length, 4);
  });

  it("reports a duplicate group name without creating another group", async (t) => {
    const { rows } = setup(t);
    await assert.rejects(saveShopGroup("h1", { name: "Colruyt-groep", shopIds: ["colruyt", "collect"] }), /already exists/);
    assert.equal(rows.length, 2);
  });
});

describe("shop group API", () => {
  let role: Role | null = null;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) req.user = { id: "user", email: "test@example.com", name: "Rob", role, locale: "nl", householdId: "h1", householdName: "Test", habitantId: null } satisfies SessionUser;
    next();
  });
  app.use("/shops", shopsRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  after(() => server.close());
  const call = (method: string, path = "", input?: unknown) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/shops/groups${path}`, {
    method, headers: { "content-type": "application/json" }, ...(input !== undefined && { body: JSON.stringify(input) }),
  });

  it("requires login; children can read groups but cannot change them", async (t) => {
    setup(t);
    role = null;
    assert.equal((await call("GET")).status, 401);
    role = "child";
    const result = await call("GET");
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json() as { name: string }[]).map((group) => group.name), ["Colruyt-groep"]);
    assert.equal((await call("POST", "", { name: "Trip", shopIds: ["colruyt", "collect"] })).status, 403);
    assert.equal((await call("PUT", "/group", { name: "Trip", shopIds: ["colruyt", "collect"] })).status, 403);
    assert.equal((await call("DELETE", "/group")).status, 403);
  });

  it("allows adults to save/update groups and rejects invalid input", async (t) => {
    setup(t); role = "adult";
    assert.equal((await call("POST", "", { name: "Trip", shopIds: ["colruyt", "okay"] })).status, 201);
    assert.equal((await call("PUT", "/group", { name: "New name", shopIds: ["colruyt", "okay"] })).status, 200);
    assert.equal((await call("POST", "", { name: "Trip", shopIds: ["colruyt"] })).status, 400);
    assert.equal((await call("DELETE", "/group")).status, 204);
  });
});
