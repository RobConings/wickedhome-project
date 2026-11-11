import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import { unitCatalogueInputSchema } from "@/types/unit-catalogue";
import { db } from "../lib/db";
import { getUnitCatalogue, saveUnitCatalogue } from "./units.service";

function stub<T extends object, K extends keyof T>(t: TestContext, target: T, key: K, implementation: unknown) {
  const original = Reflect.get(target, key);
  Reflect.set(target, key, implementation);
  t.after(() => Reflect.set(target, key, original));
}
const bottle = { name: "fles 75 cl", referenceUnit: "cl", factor: 75, rounding: 1, aliases: ["wijnfles"] };

it("reads the central catalogue within the current household", async (t) => {
  stub(t, db.household, "findUnique", async ({ where }: { where: { id: string } }) => {
    assert.equal(where.id, "home");
    return { unitDefinitions: [bottle], unitDefinitionsUpdatedAt: new Date("2026-11-11T12:00:00Z") };
  });
  assert.deepEqual(await getUnitCatalogue("home"), { units: [bottle], updatedAt: "2026-11-11T12:00:00.000Z" });
});

it("saves only central unit settings with a household and revision guard", async (t) => {
  const input = unitCatalogueInputSchema.parse({ expectedUpdatedAt: null, units: [bottle] });
  stub(t, db.household, "updateMany", async ({ where, data }: { where: object; data: Record<string, unknown> }) => {
    assert.deepEqual(where, { id: "home", unitDefinitionsUpdatedAt: null });
    assert.deepEqual(data.unitDefinitions, [bottle]);
    assert.deepEqual(Object.keys(data).sort(), ["unitDefinitions", "unitDefinitionsUpdatedAt"]);
    return { count: 1 };
  });
  assert.deepEqual((await saveUnitCatalogue("home", input)).units, [bottle]);
});

it("refuses stale or foreign household writes without reporting a successful save", async (t) => {
  stub(t, db.household, "updateMany", async () => ({ count: 0 }));
  await assert.rejects(saveUnitCatalogue("other", { units: [bottle], expectedUpdatedAt: "2026-11-11T12:00:00.000Z" }), /changed/);
});
