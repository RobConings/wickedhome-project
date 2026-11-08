import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "@/api/lib/db";
import { shoppingSessionFixture as fixture } from "@/api/shopping/sessions-test-helpers";
import { createIncome, getVoucherDetail } from "@/api/income/income.service";
import { createExpense, markExpensePaid } from "@/api/expenses/expenses.service";
import { createPlan, updatePlan, getMoneyMonth } from "@/api/money/money.service";
import { auditTargets } from "@/api/audit/audit-targets";
import type { AuditEntry } from "@/features/audit/types/audit";
import { incomeInputSchema } from "@/features/income/types/income";
import { expenseCreateInputSchema } from "@/features/expenses/types/expenses";
import { contributionPlanSchema } from "@/features/money/types/money";
import { addDays, addMonthsClamped, todayIn } from "@/types/dates";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import type { SessionUser } from "@/features/auth/types/auth";
import "@ai/skills";

const enabled = process.env.FINANCE_INTEGRATION_TESTS === "1";
after(async () => { if (enabled) await db.$disconnect(); });
async function read(user: SessionUser, name: string, args: Record<string, unknown>) {
  return handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { user, tokenId: "workspace-test", tokenName: "Workspace test", scope: "read" }, new AbortController().signal) as Promise<{ result?: { isError?: boolean; content: { text: string }[] }; error?: unknown }>;
}

it("voucher workspace retains original credits, FIFO totals, actual expense shares, paging and household/MCP boundaries", { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  const other = await fixture(t);
  const today = todayIn();
  const person = await db.habitant.create({ data: { householdId: f.home.id, name: "Voucher holder", type: "ADULT", color: "#123456" } });
  const second = await db.habitant.create({ data: { householdId: f.home.id, name: "Other payer", type: "ADULT", color: "#654321" } });
  const credit = (date: string, amountCents: number) => createIncome(f.home.id, incomeInputSchema.parse({ habitantId: person.id, date, amountCents, kind: "meal_vouchers" }));
  await credit(addMonthsClamped(today, -13), 100);
  const received = await credit(today, 500);
  await credit(addDays(today, 1), 1000);
  const expense = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Voucher groceries", amountCents: 300, dueDate: today, category: "groceries", paymentMethod: "meal_voucher", payerType: "split", shares: [{ habitantId: person.id, amountCents: 100 }, { habitantId: second.id, amountCents: 200 }] }));
  await markExpensePaid(f.home.id, expense.id, { paidOn: today });
  const detail = await getVoucherDetail(f.home.id, person.id);
  assert.equal(detail.receipts.total, 2, "future credits stay expected");
  assert.equal(detail.receipts.items[0]?.id, received.id);
  assert.equal(detail.balance.receivedCents, 600);
  assert.equal(detail.balance.availableCents, 400);
  assert.equal(detail.balance.expiredCents, 100);
  assert.equal(detail.balance.spentCents, 100, "only this person's real share");
  assert.equal(detail.spending.items[0]?.expenseId, expense.id);
  assert.equal(detail.spending.items[0]?.amountCents, 100);
  assert.equal((await getVoucherDetail(f.home.id, person.id, 2, 2)).receipts.items.length, 0);
  assert.equal((await getVoucherDetail(f.home.id, second.id)).balance.uncoveredCents, 200);
  await assert.rejects(() => getVoucherDetail(other.home.id, person.id), /not found/i);
  await assert.rejects(() => getVoucherDetail(f.home.id, person.id, 0), /Invalid page/);
  const result = await read(f.user, "income_vouchers", { person: person.id });
  assert.equal(result.result?.isError, false);
  assert.ok(result.result?.content[0]?.text.includes(expense.id));
  const child = await read({ ...f.user, role: "child" }, "income_vouchers", { person: person.id });
  assert.ok(child.error || child.result?.isError);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0, "voucher reads and spending never create bank entries");
});

it("contribution plan workspace keeps later effective versions, source IDs and read-only MCP access", { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  const other = await fixture(t);
  const today = todayIn();
  const start = `${today.slice(0, 7)}-01`;
  const person = await db.habitant.create({ data: { householdId: f.home.id, name: "Contributor", type: "ADULT", color: "#123456" } });
  const account = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Shared", kind: "JOINT", color: "#123456", isDefault: true } });
  const input = contributionPlanSchema.parse({ habitantId: person.id, accountId: account.id, amountCents: 10000, dayOfMonth: 1, activeFrom: start });
  const original = await createPlan(f.home.id, input);
  const updated = await updatePlan(f.home.id, original.id, { ...input, amountCents: 12000, activeFrom: addDays(start, 1) });
  assert.notEqual(updated.id, original.id);
  const month = await getMoneyMonth(f.home.id, today.slice(0, 7));
  assert.equal(month.plans.find((plan) => plan.id === original.id)?.activeTo, start);
  assert.equal(month.plans.find((plan) => plan.id === updated.id)?.amountCents, 12000);
  const result = await read(f.user, "money_plan_details", { planId: updated.id });
  assert.equal(result.result?.isError, false);
  assert.ok(result.result?.content[0]?.text.includes(`/money/plans/${updated.id}`));
  const foreign = await read(other.user, "money_plan_details", { planId: updated.id });
  assert.ok(foreign.error || foreign.result?.isError);
  const child = await read({ ...f.user, role: "child" }, "money_plan_details", { planId: updated.id });
  assert.ok(child.error || child.result?.isError);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0);
});

it("audit links resolve surviving owners within the household and retain historical labels after removal", { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  const other = await fixture(t);
  const entry: AuditEntry = { id: "audit-fixture", at: new Date().toISOString(), channel: "app", userId: f.user.id, actorName: "Adult", action: "inventory.save_product", targetType: "product", targetId: f.product.id, targetLabel: "Original product label", summary: "Edited product" };
  const own = await auditTargets(f.home.id, [entry]);
  assert.equal(own[0]?.targetUrl, `/inventory/products/${f.product.id}`);
  assert.equal(own[0]?.targetLabel, entry.targetLabel);
  assert.equal((await auditTargets(other.home.id, [entry]))[0]?.targetUrl, null);
  assert.equal((await auditTargets(f.home.id, [{ ...entry, targetId: "removed-record" }]))[0]?.targetUrl, null);
  assert.equal((await auditTargets(f.home.id, [{ ...entry, targetType: "internal-join" }]))[0]?.targetUrl, null);
  assert.equal((await auditTargets(f.home.id, [{ ...entry, targetType: "constructor" }]))[0]?.targetUrl, null);
});
