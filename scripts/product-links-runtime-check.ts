/** Real MCP product links against an empty temporary database; production data is never copied. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";
import type { TokenIdentity } from "../ai/core/assistant.service";

process.loadEnvFile(".env");
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL missing");
const databaseName = `wh_product_links_check_${process.pid}`;
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${databaseName}`;
const control = new pg.Client({ connectionString: sourceUrl });
await control.connect();
let created = false;
let disconnect: (() => Promise<void>) | undefined;

try {
  await control.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  execFileSync("bash", ["-o", "pipefail", "-c", 'pg_dump --schema-only --no-owner --no-acl "$LINKS_SRC" | psql -q -v ON_ERROR_STOP=1 "$LINKS_DST" > /dev/null'], {
    env: { ...process.env, LINKS_SRC: sourceUrl, LINKS_DST: targetUrl.toString() }, stdio: "pipe",
  });
  process.env.DATABASE_URL = targetUrl.toString();
  const { db } = await import("../src/api/lib/db");
  disconnect = () => db.$disconnect();
  await assert.rejects(db.$transaction((tx) => tx.$queryRaw`SELECT pg_advisory_xact_lock(1)`), /Failed to deserialize column of type 'void'/);
  console.log("PASS: original lock query reproduces the reported void deserialization error on PostgreSQL");
  const { handleMcpMessage } = await import("../ai/core/mcp.routes");
  const { setAssistantToolAuditor } = await import("../ai/core/tools");
  const { invalidateEntityCache } = await import("../ai/core/resolve");
  const { recordStockPurchase } = await import("../src/api/inventory/purchases.service");
  await import("../ai/skills");
  setAssistantToolAuditor(null);
  const household = await db.household.create({ data: { name: "Product links runtime check" } });
  const actor = { id: "runtime-check", householdId: household.id, locale: "nl" as const };
  const floor = await db.floor.create({ data: { householdId: household.id, name: "Ground floor", kind: "INDOOR", level: 0 } });
  const placeData = { householdId: household.id, floorId: floor.id, kind: "ROOM" as const, color: "#123456" };
  const place = await db.place.create({ data: { ...placeData, name: "Berging/Wasruimte" } });
  const otherPlace = await db.place.create({ data: { ...placeData, name: "Other place" } });
  const identity: TokenIdentity = {
    tokenId: "test", tokenName: "test", scope: "write",
    user: { ...actor, email: "test@example.com", name: "Test", role: "adult", householdName: household.name, habitantId: null },
  };
  const invoke = async (product: string, sharesWith: string, confirm: boolean) => await handleMcpMessage({
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "inventory_link_alternative", arguments: { product, sharesWith, confirm } },
  }, identity, new AbortController().signal) as { result: { isError: boolean; content: { text: string }[] } };
  for (const [name, mainName, unit] of [
    ["DREFT handafwas Maxpower Original 730 ml", "Dreft afwasmiddel", "fles"],
    ["MR PROPRE allesreiniger citroen 2 l", "Mister Proper", "fles"],
    ["EVERYDAY aluminiumfolie 30 m", "Everyday zilverpapier", "rol"],
  ]) {
    const product = await db.product.create({ data: { householdId: household.id, name: name!, unit, category: "HOUSEHOLD" } });
    const main = await db.product.create({ data: { householdId: household.id, name: mainName!, unit, category: "HOUSEHOLD" } });
    const source = await db.stockItem.create({ data: { householdId: household.id, productId: product.id, placeId: place.id, quantity: 0 } });
    const target = await db.stockItem.create({ data: { householdId: household.id, productId: main.id, placeId: place.id, quantity: 1 } });
    const moved = await db.stockItem.create({ data: { householdId: household.id, productId: product.id, placeId: otherPlace.id, quantity: 4 } });
    await recordStockPurchase(actor, source.id, { quantity: 2, source: { kind: "scan", reference: `fixture:${product.id}` } });
    invalidateEntityCache(household.id);
    const refused = await invoke(product.id, main.id, false);
    assert.equal(refused.result.isError, true);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockProductId, null);
    const result = await invoke(product.id, main.id, true);
    assert.equal(result.result.isError, false, `${name}: ${JSON.stringify(result.result.content)}`);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockProductId, main.id);
    assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: target.id } })).quantity.toNumber(), 3);
    assert.equal(await db.stockItem.count({ where: { id: source.id } }), 0);
    assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: moved.id } })).productId, main.id);
    const purchase = await db.stockPurchase.findFirstOrThrow({ where: { householdId: household.id, productId: main.id } });
    assert.equal(purchase.productId, main.id);
    assert.equal(purchase.stockItemId, target.id);
    const again = await invoke(product.id, main.id, true);
    assert.equal(again.result.isError, true);
    assert.match(again.result.content[0]!.text, /already share stock/);
    assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: target.id } })).quantity.toNumber(), 3);
    console.log(`PASS: ${name} -> ${mainName}; purchase, merge, move, confirmation and repeated link`);
  }
} finally {
  await disconnect?.();
  if (created) await control.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await control.end();
}
