import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "@/api/lib/db";
import { shoppingSessionFixture as fixture } from "@/api/shopping/sessions-test-helpers";
import { getShoppingSession, updateShoppingSessionItem } from "@/api/shopping/sessions.service";
import { subscribe } from "@/api/lib/events";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import "@ai/skills";
const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => { if (enabled) await db.$disconnect(); });

it("MCP and web service actions broadcast the same household-scoped visit event", options, async (t) => {
  const f = await fixture(t); const visit = await f.start(); const events: string[] = []; const foreign: string[] = [];
  const stop = subscribe(f.home.id, (event) => events.push(event.type)); const stopForeign = subscribe("another-home", (event) => foreign.push(event.type)); t.after(stop); t.after(stopForeign);
  const [reply] = await Promise.all([handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "shopping_session_update_item", arguments: { sessionId: visit.id, itemId: visit.items[0]!.id, revision: 0, operationId: "mcp-buy", status: "bought", confirm: true } } }, { user: f.user, tokenId: "fixture", tokenName: "Fixture", scope: "write" }, new AbortController().signal) as Promise<{ result: { isError?: boolean; content: { text: string }[] } }>,
    updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, { revision: 0, operationId: "web-buy", status: "bought" }),
  ]);
  assert.equal(reply.result.isError, false, reply.result.content[0]?.text);
  assert.ok(events.includes("shopping.changed")); assert.deepEqual(foreign, []);
  assert.equal(await f.quantity(), 2);
  await assert.rejects(getShoppingSession({ ...f.user, householdId: "another-home" }, visit.id), /not found/);
});


it("MCP additions to the ordinary shopping list notify both subscribers from the service layer", options, async (t) => {
  const f = await fixture(t); const first: string[] = []; const second: string[] = [];
  const stopFirst = subscribe(f.home.id, (event) => { first.push(event.type); }); const stopSecond = subscribe(f.home.id, (event) => { second.push(event.type); });
  t.after(stopFirst); t.after(stopSecond);
  const result = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "shopping_add_item", arguments: { name: f.product.name, product: f.product.id, quantity: 1, confirm: true } } }, { user: f.user, tokenId: "fixture", tokenName: "Fixture", scope: "write" }, new AbortController().signal) as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(result.result.isError, false, result.result.content[0]?.text);
  assert.ok(first.includes("shopping.changed")); assert.deepEqual(first, second);
});
