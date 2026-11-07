import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { TokenIdentity } from "@ai/core/assistant.service";
import { handleMcpMessage, mcpToolOf } from "@ai/core/mcp.routes";
import { getEntityResolver, invalidateEntityCache, type ResolvedEntity } from "@ai/core/resolve";
import { routeMessage } from "@ai/core/skills";
import { recordToolCall } from "@ai/core/tool-audit";
import { getAssistantTool, setAssistantToolAuditor, type AssistantToolContext } from "@ai/core/tools";
import "@ai/skills";
import { expenseLogInput, loggedExpenseInput } from "./logging";

const identity = (scope: "read" | "write" = "write", role: "owner" | "adult" | "child" = "adult"): TokenIdentity => ({
  tokenId: "repayment-token", tokenName: "test", scope,
  user: { id: "repayment-user", email: "test@example.com", name: "Rob", role, locale: "en", householdId: "repayment-home", householdName: "Test", habitantId: "rob" },
});
const signal = new AbortController().signal;
const ctx: AssistantToolContext = { user: identity().user, householdId: "repayment-home", locale: "en", channel: "mcp", signal };
const loan = { id: "loan-1", payee: "Car loan", category: "loans" as const };
const ref: ResolvedEntity = { type: "recurring_expense", id: loan.id, name: loan.payee };
const repayment = (amount: number, extra: Record<string, unknown> = {}) => ({
  ...expenseLogInput.parse({ loan: loan.id, amount, date: "2026-10-28", ...extra }), loan: ref,
});

afterEach(() => {
  mock.restoreAll();
  invalidateEntityCache();
  setAssistantToolAuditor(recordToolCall);
});

describe("expense tool repayment input", () => {
  it("maps partial and full repayments to the normal paid-expense contract", () => {
    for (const [amount, cents] of [[250, 25000], [4027.81, 402781]] as const) {
      const data = loggedExpenseInput(ctx, repayment(amount), loan);
      assert.equal(data.earlyRepaymentForId, loan.id);
      assert.equal(data.payee, loan.payee);
      assert.equal(data.category, loan.category);
      assert.equal(data.amountCents, cents);
      assert.equal(data.paidOn, "2026-10-28");
      assert.equal(data.dueDate, data.paidOn);
      assert.equal(data.paymentMethod, "wire_transfer");
      assert.equal(data.payerType, "joint");
      assert.equal(data.projectId, undefined, "the expense service can inherit the loan's project");
    }
  });

  it("keeps personal repayments personal and preserves the given method and description", () => {
    const data = loggedExpenseInput(ctx, repayment(50, { paidBy: "me", paymentMethod: "cash", description: "Extra payment" }), loan);
    assert.equal(data.payerType, "person");
    assert.equal(data.payerHabitantId, "rob");
    assert.equal(data.paymentMethod, "cash");
    assert.equal(data.description, "Extra payment");
  });

  it("preserves everyday spending and its existing defaults", () => {
    const data = loggedExpenseInput(ctx, expenseLogInput.parse({ payee: "Delhaize", amount: 45, category: "groceries" }));
    assert.equal(data.amountCents, 4500);
    assert.equal(data.payee, "Delhaize");
    assert.equal(data.category, "groceries");
    assert.equal(data.paymentMethod, "card");
    assert.equal(data.payerType, "joint");
    assert.equal(data.earlyRepaymentForId, undefined);
    const vouchers = loggedExpenseInput(ctx, expenseLogInput.parse({ payee: "Colruyt", amount: 23, category: "groceries", paymentMethod: "meal_voucher" }));
    assert.equal(vouchers.payerHabitantId, "rob");
  });

  it("requires an exact amount and a loan or normal expense details, and rejects vouchers for loans", () => {
    for (const input of [
      { loan: "loan-1" }, { loan: "loan-1", amount: 0 }, { amount: 10 },
      { payee: "Shop", amount: 10 }, { category: "loans", amount: 10 },
      { loan: "loan-1", amount: 10, paymentMethod: "meal_voucher" },
    ]) assert.equal(expenseLogInput.safeParse(input).success, false, JSON.stringify(input));
    assert.throws(() => loggedExpenseInput(ctx, repayment(10)), /Loan not found/);
    assert.throws(() => loggedExpenseInput(ctx, repayment(10), { ...loan, id: "another-loan" }), /Loan not found/);
    assert.throws(() => loggedExpenseInput({ ...ctx, user: { ...ctx.user, habitantId: null } }, repayment(10, { paidBy: "me" }), loan), /no habitant/);
  });
});

type CallResult = { result: { content: { text: string }[]; isError: boolean } };
const rpc = (params: Record<string, unknown>) => ({ jsonrpc: "2.0" as const, id: 1, method: "tools/call", params });

describe("loan repayments over MCP", () => {
  it("advertises the loan selector, exact amount and confirmation on the existing expense tool", () => {
    const tool = getAssistantTool("expenses.log")!;
    const exposed = mcpToolOf(tool);
    const schema = exposed.inputSchema as { properties: Record<string, { type?: string }>; required: string[] };
    assert.equal(exposed.name, "expenses_log");
    assert.equal(schema.properties.loan?.type, "string");
    assert.equal(schema.properties.amount?.type, "number");
    assert.equal(schema.properties.confirm?.type, "boolean");
    assert.ok(schema.required.includes("amount"));
    assert.equal(tool.permission, "sensitive");
    assert.equal(tool.confirm, "always");
    assert.deepEqual([...tool.roles].sort(), ["adult", "owner"]);
  });

  it("resolves the loan by name, requires confirmation, and audits the exact confirmed amount", async () => {
    const tool = getAssistantTool("expenses.log")!;
    const resolver = getEntityResolver("recurring_expense")!;
    assert.ok(resolver.list);
    mock.method(resolver as typeof resolver & { list: NonNullable<typeof resolver.list> }, "list", async () => [{ id: loan.id, name: loan.payee }]);
    const executed: unknown[] = [];
    const audited: unknown[] = [];
    mock.method(tool, "run", (runCtx: AssistantToolContext, input: unknown) => {
      assert.equal(runCtx.channel, "mcp");
      assert.equal(runCtx.householdId, ctx.householdId);
      executed.push(input);
      return { done: "Recorded", id: "repayment-1" };
    });
    setAssistantToolAuditor(async (_tool, _ctx, input) => { audited.push(input); });
    const args = { loan: "Car loan", amount: 250, date: "2026-10-28" };
    const unconfirmed = await handleMcpMessage(rpc({ name: "expenses_log", arguments: args }), identity(), signal) as CallResult;
    assert.equal(unconfirmed.result.isError, true);
    assert.match(unconfirmed.result.content[0]!.text, /extra repayment.*250,00.*Car loan/);
    assert.equal(executed.length, 0);
    assert.equal(audited.length, 0);
    const confirmed = await handleMcpMessage(rpc({ name: "expenses_log", arguments: { ...args, confirm: true } }), identity(), signal) as CallResult;
    assert.equal(confirmed.result.isError, false);
    assert.deepEqual(executed, [{ loan: ref, amount: 250, date: args.date, paidBy: "joint" }]);
    assert.deepEqual(audited, executed);
  });

  it("refuses repayments for read-only tokens and children before execution", async () => {
    const execute = mock.method(getAssistantTool("expenses.log")!, "run", () => { throw new Error("Must not run"); });
    for (const caller of [identity("read"), identity("write", "child")]) {
      const response = await handleMcpMessage(rpc({ name: "expenses_log", arguments: { loan: "Car loan", amount: 250, confirm: true } }), caller, signal) as { error?: { code: number } };
      assert.equal(response.error?.code, -32602);
    }
    assert.equal(execute.mock.callCount(), 0);
  });

  it("routes Dutch and English early-repayment requests to expenses", () => {
    for (const message of ["Boek een extra aflossing van 500 euro", "Record a partial early repayment", "Record the full payoff", "Pay back the down payment"]) {
      assert.ok(routeMessage(message).some((match) => match.id === "expenses"), message);
    }
  });
});
