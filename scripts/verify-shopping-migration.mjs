import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

// Only a fresh, uniquely named schema in an explicitly designated test/CI database is used.
const target = process.env.MIGRATION_TEST_DATABASE_URL;
assert.ok(
  target,
  "Set MIGRATION_TEST_DATABASE_URL to a disposable test database",
);
const url = new URL(target);
assert.match(
  url.pathname,
  /(?:test|ci)$/i,
  "Refusing a database that is not named test/ci",
);
const schema = `shopping_migration_${crypto.randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), "wh-migration-"));
const migrations = path.join(root, "prisma/migrations");
const legacy = path.join(temporary, "migrations");
const config = path.join(temporary, "prisma.config.mjs");
const require = createRequire(import.meta.url);
const configModule = pathToFileURL(require.resolve("prisma/config")).href;
const client = new pg.Client({ connectionString: target });
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
let created = false;
function migrate() {
  const result = spawnSync(
    path.join(root, "node_modules/.bin/prisma"),
    ["migrate", "deploy", "--config", config],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
}
async function configuration(directory) {
  await writeFile(
    config,
    `import { defineConfig } from ${JSON.stringify(configModule)};\nexport default defineConfig({ schema: ${JSON.stringify(path.join(root, "prisma/schema"))}, migrations: { path: ${JSON.stringify(directory)} }, datasource: { url: process.env.DATABASE_URL } });\n`,
  );
}
async function insert(table, values) {
  const columns = Object.keys(values);
  await client.query(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    Object.values(values),
  );
}
try {
  await client.connect();
  await client.query(`CREATE SCHEMA ${quote(schema)}`);
  created = true;
  await client.query(`SET search_path TO ${quote(schema)}`);
  await mkdir(legacy);
  for (const entry of await readdir(migrations, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name < "20261107170000_shopping_skip")
      await cp(
        path.join(migrations, entry.name),
        path.join(legacy, entry.name),
        { recursive: true },
      );
  }
  await configuration(legacy);
  migrate();
  const updatedAt = new Date("2026-10-16T14:49:00Z");
  await insert("households", {
    id: "legacy-home",
    name: "Retain me",
    updatedAt,
  });
  await insert("users", {
    id: "legacy-user",
    email: "migration@example.test",
    passwordHash: "test",
    role: "ADULT",
    householdId: "legacy-home",
    updatedAt,
  });
  await insert("floors", {
    id: "legacy-floor",
    householdId: "legacy-home",
    name: "Floor",
    level: 0,
    kind: "INDOOR",
    updatedAt,
  });
  await insert("places", {
    id: "legacy-place",
    householdId: "legacy-home",
    floorId: "legacy-floor",
    name: "Pantry",
    kind: "ROOM",
    color: "#123456",
    updatedAt,
  });
  await insert("products", {
    id: "legacy-product",
    householdId: "legacy-home",
    name: "Tomato paste",
    unit: "potje",
    category: "PANTRY",
    isEssential: true,
    updatedAt,
  });
  await insert("stock_items", {
    id: "legacy-stock",
    householdId: "legacy-home",
    productId: "legacy-product",
    placeId: "legacy-place",
    quantity: "10.000",
    unit: "potje",
    minQuantity: "2.000",
    updatedAt,
  });
  await insert("stock_purchases", {
    id: "legacy-purchase",
    householdId: "legacy-home",
    stockItemId: "legacy-stock",
    productId: "legacy-product",
    quantity: "10.000",
    unit: "potje",
    purchasedAt: updatedAt,
    stockAdded: true,
    userId: "legacy-user",
  });
  await insert("stock_purchase_evidence", {
    id: "legacy-evidence",
    householdId: "legacy-home",
    sourceKey: "scan:legacy",
    stockItemId: "legacy-stock",
    quantity: "10.000",
    purchaseIds: ["legacy-purchase"],
  });
  await insert("stock_movements", {
    id: "legacy-movement",
    householdId: "legacy-home",
    stockItemId: "legacy-stock",
    delta: "10.000",
    quantityAfter: "10.000",
    reason: "BOUGHT",
    userId: "legacy-user",
  });
  await insert("shopping_lists", {
    id: "legacy-list",
    householdId: "legacy-home",
    name: "Shopping",
    kind: "GROCERIES",
    updatedAt,
  });
  await insert("shopping_items", {
    id: "legacy-item",
    householdId: "legacy-home",
    listId: "legacy-list",
    productId: "legacy-product",
    name: "Tomato paste",
    quantity: "2.000",
    unit: "potje",
    status: "BOUGHT",
    boughtAt: updatedAt,
    updatedAt,
  });
  await insert("recipes", {
    id: "legacy-recipe",
    householdId: "legacy-home",
    name: "Sauce",
    servings: 4,
    updatedAt,
  });
  await insert("recipe_ingredients", {
    id: "legacy-ingredient",
    recipeId: "legacy-recipe",
    productId: "legacy-product",
    position: 0,
    name: "Tomato paste",
    quantity: "1.000",
    unit: "potje",
    updatedAt,
  });
  await insert("bills", {
    id: "legacy-expense",
    householdId: "legacy-home",
    payee: "Colruyt",
    amountCents: 1499,
    category: "GROCERIES",
    dueDate: "2026-10-16",
    paidOn: "2026-10-16",
    payerType: "JOINT",
    updatedAt,
  });
  const tables = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name",
      [schema],
    )
  ).rows;
  const snapshots = [];
  for (const { table_name: table } of tables) {
    const columns = (
      await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",
        [schema, table],
      )
    ).rows.map((row) => row.column_name);
    const sql = `SELECT to_jsonb(legacy_row) AS row FROM (SELECT ${columns.map(quote).join(",")} FROM ${quote(schema)}.${quote(table)}) legacy_row ORDER BY to_jsonb(legacy_row)::text`;
    snapshots.push({ table, sql, rows: (await client.query(sql)).rows });
  }
  await configuration(migrations);
  migrate();
  for (const snapshot of snapshots)
    assert.deepEqual(
      (await client.query(snapshot.sql)).rows,
      snapshot.rows,
      `Existing data changed in ${snapshot.table}`,
    );
  const records = snapshots.reduce(
    (sum, snapshot) => sum + snapshot.rows.length,
    0,
  );
  assert.equal(records, 14);
  // Also check the new relations are additive and original sources still resolve.
  const result = await client.query(
    'SELECT "shoppingPurchaseId", "sessionItemId", "quantity"::text FROM "stock_purchases" WHERE id=$1',
    ["legacy-purchase"],
  );
  assert.deepEqual(result.rows[0], {
    shoppingPurchaseId: null,
    sessionItemId: null,
    quantity: "10.000",
  });
  const purpose = await client.query('SELECT "allocationRevision", "allocationHouseholdQuantity", "purchasedQuantity", "purchasedUnit" FROM "stock_purchases" WHERE id=$1', ["legacy-purchase"]);
  assert.deepEqual(purpose.rows[0], { allocationRevision: 0, allocationHouseholdQuantity: null, purchasedQuantity: null, purchasedUnit: null });
  assert.equal((await client.query('SELECT count(*)::int AS n FROM "purchase_project_allocations"')).rows[0].n, 0);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM "expense_project_allocations"')).rows[0].n, 0);
  console.log(
    `Migration preservation passed: ${snapshots.length} legacy tables, ${records} populated records unchanged; products, recipes, requirements, stock, acquisition evidence and paid expenses retained.`,
  );
} finally {
  if (created) await client.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
  await client.end();
  await rm(temporary, { recursive: true, force: true });
}
