import assert from "node:assert/strict";
import { after, it } from "node:test";
import { db } from "@/api/lib/db";
import { shoppingSessionFixture as fixture } from "@/api/shopping/sessions-test-helpers";
import {
  createExpense, deleteRecurringExpense, getExpenseDetail, getRecurringExpenseDetail,
  markExpensePaid, markExpenseUnpaid, setRecurringStatus, updateRecurringExpense,
} from "@/api/expenses/expenses.service";
import { autoPayDirectDebits } from "@/api/expenses/auto-pay";
import { getMoneyMonth, listJointAccounts } from "@/api/money/money.service";
import { expenseCreateInputSchema, recurringExpenseInputSchema } from "@/features/expenses/types/expenses";
import { todayIn } from "@/types/dates";
import { handleMcpMessage } from "@ai/core/mcp.routes";
import type { SessionUser } from "@/features/auth/types/auth";
import "@ai/skills";

const enabled = process.env.FINANCE_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => { if (enabled) await db.$disconnect(); });

async function call(user: SessionUser, name: string, args: Record<string, unknown>, scope: "read" | "write" = "write") {
  const reply = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    { user, tokenId: "finance-fixture", tokenName: "Finance fixture", scope }, new AbortController().signal) as {
      result?: { isError?: boolean; content: { text: string }[] };
      error?: { message: string };
    };
  assert.ok(reply.result || reply.error, "MCP returns a tool result or a protocol-level permission error");
  return reply.result ?? { isError: true, content: [{ text: reply.error!.message }] };
}

it("recurring schedule → occurrence → web/MCP payment → one account debit retains history through edit, pause, resume, end and deletion", options, async (t) => {
  const f = await fixture(t);
  const today = todayIn();
  const account = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Household account", kind: "JOINT", color: "#123456", isDefault: true } });
  const input = { payee: "Household insurance", amountCents: 9900, dueDate: today, category: "insurance", payerType: "joint", rrule: "FREQ=MONTHLY", kind: "insurance", paymentMethod: "wire_transfer" };
  const first = await createExpense(f.home.id, expenseCreateInputSchema.parse(input));
  const id = first.recurringExpenseId!;
  assert.ok(id);
  const initial = await getRecurringExpenseDetail(f.home.id, id);
  assert.ok(initial.upcoming.some((expense) => expense.id === first.id));
  const paid = await markExpensePaid(f.home.id, first.id, { paidOn: today });
  assert.equal(paid.status, "paid");
  const replay = await call(f.user, "expenses_mark_paid", { expense: first.id, paid: true, paidOn: today, confirm: true });
  assert.equal(replay.isError, true, "MCP reports an already-paid occurrence instead of paying it again");
  assert.match(replay.content[0]!.text, /already paid/);
  await markExpensePaid(f.home.id, first.id, { paidOn: today });
  const month = await getMoneyMonth(f.home.id, today.slice(0, 7));
  const lines = month.accountMonths.find((row) => row.accountId === account.id)!.lines.filter((row) => row.source === "expense");
  assert.deepEqual(lines.map((row) => [row.sourceId, row.amountCents]), [[first.id, -9900]]);
  assert.equal((await listJointAccounts(f.home.id))[0]!.balanceCents, -9900);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0, "An expense supplies its ledger effect without a second entry");

  const foreign = await fixture(t);
  await assert.rejects(getRecurringExpenseDetail(foreign.home.id, id), /not found/);
  const deniedChild = await call({ ...f.user, role: "child" }, "expenses_edit", { recurring: id, status: "paused", confirm: true });
  assert.equal(deniedChild.isError, true);
  const deniedScope = await call(f.user, "expenses_edit", { recurring: id, status: "paused", confirm: true }, "read");
  assert.equal(deniedScope.isError, true);
  assert.equal((await getRecurringExpenseDetail(f.home.id, id)).recurring.status, "active");

  await setRecurringStatus(f.home.id, id, { status: "paused" });
  const paused = await getRecurringExpenseDetail(f.home.id, id);
  assert.equal(paused.recurring.status, "paused");
  assert.deepEqual(paused.history.map((row) => row.id), [first.id]);
  assert.equal(await db.expense.count({ where: { recurringExpenseId: id, paidOn: null, dueDate: { gt: new Date(today) } } }), 0);
  const resumed = await call(f.user, "expenses_edit", { recurring: id, status: "active", confirm: true });
  assert.equal(resumed.isError, false, resumed.content[0]?.text);
  assert.ok((await getRecurringExpenseDetail(f.home.id, id)).upcoming.length > 0);
  await updateRecurringExpense(f.home.id, id, recurringExpenseInputSchema.parse({ ...input, amountCents: 10900, startDate: today }));
  const edited = await getRecurringExpenseDetail(f.home.id, id);
  assert.equal(edited.recurring.amountCents, 10900);
  assert.ok(edited.upcoming.every((row) => row.amountCents === 10900));
  assert.equal((await getExpenseDetail(f.home.id, first.id)).expense.amountCents, 9900, "Series edits preserve paid occurrence values and IDs");
  await setRecurringStatus(f.home.id, id, { status: "ended", endDate: today });
  assert.equal((await getRecurringExpenseDetail(f.home.id, id)).recurring.status, "ended");
  await deleteRecurringExpense(f.home.id, id);
  const historical = await getExpenseDetail(f.home.id, first.id);
  assert.equal(historical.expense.id, first.id);
  assert.equal(historical.expense.paidOn, today);
  assert.equal(historical.recurring, null);
  assert.equal((await listJointAccounts(f.home.id))[0]!.balanceCents, -9900);
  assert.equal(await f.quantity(), 0, "Finance never changes inventory");
});

it("direct-debit automation and its replay debit once; undo stays unpaid through the next run and can be manually paid again", options, async (t) => {
  const f = await fixture(t);
  const today = todayIn();
  await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Joint", kind: "JOINT", color: "#123456", isDefault: true } });
  const first = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Monthly internet", amountCents: 4500, dueDate: today, category: "internet_phone", payerType: "joint", rrule: "FREQ=MONTHLY", kind: "subscription", paymentMethod: "direct_debit" }));
  await autoPayDirectDebits({ today });
  const paid = (await getExpenseDetail(f.home.id, first.id)).expense;
  assert.equal(paid.paidOn, today);
  assert.equal(paid.autoPaid, true);
  await autoPayDirectDebits({ today });
  assert.equal((await listJointAccounts(f.home.id))[0]!.balanceCents, -4500);
  await markExpenseUnpaid(f.home.id, first.id);
  await autoPayDirectDebits({ today });
  assert.equal((await getExpenseDetail(f.home.id, first.id)).expense.paidOn, null);
  assert.equal((await listJointAccounts(f.home.id))[0]!.balanceCents, 0);
  const reply = await call(f.user, "expenses_mark_paid", { expense: first.id, paid: true, paidOn: today, confirm: true });
  assert.equal(reply.isError, false, reply.content[0]?.text);
  assert.equal((await listJointAccounts(f.home.id))[0]!.balanceCents, -4500);
});
