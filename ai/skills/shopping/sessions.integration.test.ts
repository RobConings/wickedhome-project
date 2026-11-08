import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "@/api/lib/db";
import { shoppingSessionFixture as fixture } from "@/api/shopping/sessions-test-helpers";
import {
  getShoppingSession,
  updateShoppingSessionItem,
} from "@/api/shopping/sessions.service";
import { subscribe } from "@/api/lib/events";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import "@ai/skills";
const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => {
  if (enabled) await db.$disconnect();
});

it(
  "MCP and web service actions broadcast the same household-scoped visit event",
  options,
  async (t) => {
    const f = await fixture(t);
    const visit = await f.start();
    const events: string[] = [];
    const foreign: string[] = [];
    const stop = subscribe(f.home.id, (event) => events.push(event.type));
    const stopForeign = subscribe("another-home", (event) =>
      foreign.push(event.type),
    );
    t.after(stop);
    t.after(stopForeign);
    const [reply] = await Promise.all([
      handleMcpMessage(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "shopping_session_update_item",
            arguments: {
              sessionId: visit.id,
              itemId: visit.items[0]!.id,
              revision: 0,
              operationId: "mcp-buy",
              status: "bought",
              confirm: true,
            },
          },
        },
        {
          user: f.user,
          tokenId: "fixture",
          tokenName: "Fixture",
          scope: "write",
        },
        new AbortController().signal,
      ) as Promise<{
        result: { isError?: boolean; content: { text: string }[] };
      }>,
      updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, {
        revision: 0,
        operationId: "web-buy",
        status: "bought",
      }),
    ]);
    assert.equal(reply.result.isError, false, reply.result.content[0]?.text);
    assert.ok(events.includes("shopping.changed"));
    assert.deepEqual(foreign, []);
    assert.equal(await f.quantity(), 2);
    await assert.rejects(
      getShoppingSession({ ...f.user, householdId: "another-home" }, visit.id),
      /not found/,
    );
  },
);

it(
  "MCP additions to the ordinary shopping list notify both subscribers from the service layer",
  options,
  async (t) => {
    const f = await fixture(t);
    const first: string[] = [];
    const second: string[] = [];
    const stopFirst = subscribe(f.home.id, (event) => {
      first.push(event.type);
    });
    const stopSecond = subscribe(f.home.id, (event) => {
      second.push(event.type);
    });
    t.after(stopFirst);
    t.after(stopSecond);
    const result = (await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "shopping_add_item",
          arguments: {
            name: f.product.name,
            product: f.product.id,
            quantity: 1,
            confirm: true,
          },
        },
      },
      {
        user: f.user,
        tokenId: "fixture",
        tokenName: "Fixture",
        scope: "write",
      },
      new AbortController().signal,
    )) as { result: { isError: boolean; content: { text: string }[] } };
    assert.equal(result.result.isError, false, result.result.content[0]?.text);
    assert.ok(first.includes("shopping.changed"));
    assert.deepEqual(first, second);
  },
);

it(
  "MCP resolves household payment ids without exposing another household or children",
  options,
  async (t) => {
    const f = await fixture(t);
    const other = await fixture(t);
    const account = await db.paymentAccount.create({
      data: {
        householdId: f.home.id,
        name: "Gezamenlijke rekening",
        kind: "JOINT",
        color: "#123456",
      },
    });
    await db.paymentAccount.create({
      data: {
        householdId: other.home.id,
        name: "Foreign private account",
        kind: "JOINT",
        color: "#123456",
      },
    });
    const call = async (role = f.user.role) =>
      (await handleMcpMessage(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "shopping_payment_options", arguments: {} },
        },
        {
          user: { ...f.user, role },
          tokenId: "fixture",
          tokenName: "Fixture",
          scope: "read",
        },
        new AbortController().signal,
      )) as {
        result: {
          isError?: boolean;
          structuredContent?: { accounts: { id: string; name: string }[] };
        };
        error?: unknown;
      };
    const reply = await call();
    assert.equal(reply.result.isError, false);
    assert.deepEqual(reply.result.structuredContent?.accounts, [
      { id: account.id, name: account.name },
    ]);
    const child = await call("child");
    assert.ok(child.error || child.result.isError);
  },
);

it("MCP purchase context and purpose/cost allocation use the web owners, scopes and original records", options, async (t) => {
  const f = await fixture(t);
  const project = await db.project.create({ data: { householdId: f.home.id, name: "Bathroom", color: "#123456" } });
  const expense = await db.expense.create({ data: { householdId: f.home.id, payee: "Mixed receipt", amountCents: 4500, category: "HOUSEHOLD", payerType: "JOINT", dueDate: new Date(), paidOn: new Date() } });
  const visit = await f.start();
  await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, { revision: visit.items[0]!.revision, operationId: "mcp-context-buy", status: "bought" });
  const acquisition = await db.stockPurchase.findFirstOrThrow({ where: { householdId: f.home.id } });
  const call = async (name: string, args: Record<string, unknown>, role = f.user.role, scope: "read" | "write" = "write") => await handleMcpMessage({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }, { user: { ...f.user, role }, tokenId: "fixture", tokenName: "Fixture", scope }, new AbortController().signal) as { result?: { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> }; error?: unknown };
  const goods = await call("purchases_goods_allocation", { acquisitionId: acquisition.id });
  assert.equal(goods.result?.isError, false, goods.result?.content[0]?.text);
  const purpose = { acquisitionId: acquisition.id, revision: goods.result!.structuredContent!.revision, householdQuantity: 1, projects: [{ project: project.id, quantity: 1 }], confirm: true };
  const assigned = await call("purchases_allocate_goods", purpose);
  assert.equal(assigned.result?.isError, false, assigned.result?.content[0]?.text);
  const costs = await call("expenses_project_allocation", { expense: expense.id });
  assert.equal(costs.result?.isError, false, costs.result?.content[0]?.text);
  const allocation = { expense: expense.id, revision: costs.result!.structuredContent!.revision, householdCents: 1000, projects: [{ project: project.id, amountCents: 3500 }], confirm: true };
  const allocated = await call("expenses_allocate_projects", allocation);
  assert.equal(allocated.result?.isError, false, allocated.result?.content[0]?.text);
  const history = await call("purchases_list", { projectId: project.id });
  assert.equal(history.result?.isError, false, history.result?.content[0]?.text);
  const context = await call("inventory_product_context", { product: f.product.id });
  assert.equal(context.result?.isError, false, context.result?.content[0]?.text);
  assert.match(JSON.stringify(context.result?.structuredContent), new RegExp(project.id));
  for (const [name, payload] of [["purchases_allocate_goods", purpose], ["expenses_allocate_projects", allocation]] as const) {
    const child = await call(name, payload, "child"); assert.ok(child.error || child.result?.isError);
    const readOnly = await call(name, payload, "adult", "read"); assert.ok(readOnly.error || readOnly.result?.isError);
  }
  assert.equal(await f.quantity(), 2);
  assert.equal(await db.stockMovement.count({ where: { householdId: f.home.id, reason: "BOUGHT" } }), 1);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 1);
  assert.equal(await db.expenseProjectAllocation.count({ where: { expenseId: expense.id } }), 1);
});
