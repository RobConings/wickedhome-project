import assert from "node:assert/strict";
import { after, it } from "node:test";
import { HttpError } from "@/api/lib/http";
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
  await assert.rejects(getRecurringExpenseDetail(foreign.home.id, id), /not found/i);
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

it("complete recurring payment pages retain old history and extra repayments, filter and clamp pages, isolate households and match MCP without a second money effect", options, async (t) => {
  const { listRecurringPayments } = await import("@/api/expenses/expenses.service");
  const { recurringPaymentsQuerySchema } = await import("@/features/expenses/types/expenses");
  const f = await fixture(t);
  await db.paymentAccount.create({ data: { householdId: f.home.id, name: "History account", kind: "JOINT", color: "#123456", isDefault: true } });
  const first = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Historic commitment", amountCents: 100, dueDate: todayIn(), rrule: "FREQ=MONTHLY", category: "insurance", payerType: "joint" }));
  const id = first.recurringExpenseId!;
  await db.expense.createMany({ data: Array.from({ length: 31 }, (_, index) => ({
    householdId: f.home.id, payee: "Historic commitment", amountCents: 100, category: "INSURANCE" as const, payerType: "JOINT" as const,
    dueDate: new Date(Date.UTC(2020 + Math.floor(index / 12), index % 12, 1)), paidOn: new Date("2023-12-31"),
    ...(index === 30 ? { earlyRepaymentForId: id } : { recurringExpenseId: id }),
  })) });
  const before = (await listJointAccounts(f.home.id))[0]!.balanceCents;
  const ids: string[] = [];
  for (const page of [1, 2, 3, 4]) {
    const result = await listRecurringPayments(f.home.id, id, recurringPaymentsQuerySchema.parse({ status: "paid", page, pageSize: 10 }));
    assert.equal(result.total, 31);
    ids.push(...result.items.map((row) => row.id));
  }
  assert.equal(new Set(ids).size, 31, "More than the old 24-row preview is reachable without duplicates");
  const oldDetail = await call(f.user, "expenses_details", { expense: ids[0] });
  assert.equal(oldDetail.isError, false, oldDetail.content[0]?.text);
  const last = await listRecurringPayments(f.home.id, id, recurringPaymentsQuerySchema.parse({ status: "paid", page: 999, pageSize: 10 }));
  assert.equal(last.page, 4);
  const unpaid = await listRecurringPayments(f.home.id, id, recurringPaymentsQuerySchema.parse({ status: "unpaid" }));
  assert.ok(unpaid.items.length > 0);
  assert.ok(unpaid.items.every((row) => row.paidOn === null));
  const foreign = await fixture(t);
  await assert.rejects(listRecurringPayments(foreign.home.id, id, recurringPaymentsQuerySchema.parse({})), /not found/i);
  await setRecurringStatus(f.home.id, id, { status: "ended", endDate: todayIn() });
  const reply = await call(f.user, "expenses_payments", { recurring: id, status: "paid", page: 2, pageSize: 10 });
  assert.equal(reply.isError, false, reply.content[0]?.text);
  const mcp = JSON.parse(reply.content[0]!.text);
  const web = await listRecurringPayments(f.home.id, id, recurringPaymentsQuerySchema.parse({ status: "paid", page: 2, pageSize: 10 }));
  assert.deepEqual(mcp.items.map((row: { id: string }) => row.id), web.items.map((row) => row.id));
  assert.equal((await listJointAccounts(f.home.id))[0]!.balanceCents, before);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0);
});

it("expense account navigation uses the actual selected/default account and existing source line, then removes the effect on undo", options, async (t) => {
  const { getExpenseAccountEffect, setBalance } = await import("@/api/money/money.service");
  const f = await fixture(t);
  const a = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Default", kind: "JOINT", color: "#123456", isDefault: true } });
  const b = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Selected", kind: "JOINT", color: "#345678" } });
  const expense = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Account source", amountCents: 1200, category: "household", payerType: "joint", dueDate: todayIn(), paidOn: todayIn() }));
  const defaultEffect = await getExpenseAccountEffect(f.home.id, expense.id);
  assert.equal(defaultEffect.status, "posted"); assert.equal(defaultEffect.account!.id, a.id);
  assert.equal(defaultEffect.lineKey, `expense:${expense.id}`); assert.equal(defaultEffect.amountCents, -1200);
  await db.expense.update({ where: { id: expense.id }, data: { paymentAccountId: b.id } });
  const selected = await getExpenseAccountEffect(f.home.id, expense.id);
  assert.equal(selected.account!.id, b.id);
  const reply = await call(f.user, "money_expense_account", { expense: expense.id });
  assert.equal(reply.isError, false, reply.content[0]?.text);
  assert.deepEqual(JSON.parse(reply.content[0]!.text), selected);
  assert.equal((await call({ ...f.user, role: "child" }, "money_expense_account", { expense: expense.id })).isError, true);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0);
  assert.equal((await listJointAccounts(f.home.id)).reduce((sum, row) => sum + row.balanceCents, 0), -1200);
  const foreign = await fixture(t);
  await assert.rejects(getExpenseAccountEffect(foreign.home.id, expense.id), /not found/i);
  await markExpenseUnpaid(f.home.id, expense.id);
  const unpaid = await getExpenseAccountEffect(f.home.id, expense.id);
  assert.equal(unpaid.status, "unpaid"); assert.equal(unpaid.amountCents, null);
  assert.equal((await listJointAccounts(f.home.id)).reduce((sum, row) => sum + row.balanceCents, 0), 0);
  const old = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Before opening", amountCents: 300, category: "household", payerType: "joint", dueDate: "2020-01-01", paidOn: "2020-01-01" }));
  await setBalance(f.home.id, f.user.id, a.id, { date: todayIn(), balanceCents: 5000, note: null });
  const outside = await getExpenseAccountEffect(f.home.id, old.id);
  assert.equal(outside.status, "outsideHistory"); assert.equal(outside.amountCents, null);
  assert.equal((await listJointAccounts(f.home.id)).find((row) => row.id === a.id)!.balanceCents, 5000);
});

it("income owner records preserve old receipts, source amount history, month occurrences and a single derived account credit through web/MCP reads", options, async (t) => {
  const { createIncomeSource, createIncome, getIncome, getIncomeSource, updateIncomeSource, deleteIncomeSource } = await import("@/api/income/income.service");
  const { incomeSourceCreateSchema, incomeSourceUpdateSchema, incomeInputSchema } = await import("@/features/income/types/income");
  const f = await fixture(t);
  const foreign = await fixture(t);
  const account = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Income account", kind: "JOINT", color: "#123456", isDefault: true } });
  const input = { name: "Old salary", kind: "salary", rrule: "FREQ=MONTHLY", startDate: "2018-01-01", amountMode: "fixed", amountCents: 100000, targetAccountId: account.id };
  const source = await createIncomeSource(f.home.id, incomeSourceCreateSchema.parse(input));
  const old = await createIncome(f.home.id, incomeInputSchema.parse({ sourceId: source.id, periodDate: "2018-01-01", date: "2018-01-02", amountCents: 99900, kind: "salary", targetAccountId: account.id }));
  await updateIncomeSource(f.home.id, source.id, incomeSourceUpdateSchema.parse({ ...input, amountCents: 110000, amountFrom: "2020-01-01" }));
  const detail = await getIncomeSource(f.home.id, source.id, "2018-01", 999);
  assert.equal(detail.history.page, 1);
  assert.equal(detail.history.total, 1);
  assert.equal(detail.source.amounts.length, 2);
  assert.equal(detail.occurrences[0]!.plannedCents, 100000);
  assert.equal(detail.occurrences[0]!.income!.id, old.id);
  assert.equal((await getIncome(f.home.id, old.id)).amountCents, 99900);
  const ledger = (await getMoneyMonth(f.home.id, "2018-01")).accountMonths.find((row) => row.accountId === account.id)!;
  assert.deepEqual(ledger.lines.filter((row) => row.source === "income").map((row) => [row.sourceId, row.amountCents]), [[old.id, 99900]]);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0);
  assert.equal((await call(f.user, "income_source", { source: source.id, month: "2018-01" }, "read")).isError, false);
  const receipt = await call(f.user, "income_receipt", { id: old.id }, "read");
  assert.equal(receipt.isError, false, receipt.content[0]?.text);
  assert.match(receipt.content[0]!.text, new RegExp(old.id));
  assert.equal((await call({ ...f.user, role: "child" }, "income_receipt", { id: old.id }, "read")).isError, true);
  await assert.rejects(getIncome(foreign.home.id, old.id), /not found/i);
  await assert.rejects(getIncomeSource(foreign.home.id, source.id, "2018-01"), /not found/i);
  assert.equal((await call(foreign.user, "income_receipt", { id: old.id }, "read")).isError, true);
  await deleteIncomeSource(f.home.id, source.id);
  assert.equal((await getIncome(f.home.id, old.id)).sourceId, null);
  const after = (await getMoneyMonth(f.home.id, "2018-01")).accountMonths.find((row) => row.accountId === account.id)!;
  assert.equal(after.lines.filter((row) => row.source === "income").length, 1, "Deleting the plan preserves the real receipt and its sole account effect");
});

it("recurring documents expose schedule and migrated subscription attachments, match MCP and retain files without creating payments", options, async (t) => {
  const { attachFile, listLinkedFiles, getDocumentDetail, updateFile } = await import("@/api/documents/documents.service");
  const f = await fixture(t);
  const foreign = await fixture(t);
  const today = todayIn();
  const first = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Documented insurance", amountCents: 9900, dueDate: today, category: "insurance", rrule: "FREQ=MONTHLY", payerType: "joint" }));
  const id = first.recurringExpenseId!;
  const originalId = `original-${id}`;
  await db.recurringExpense.update({ where: { id }, data: { legacySubscriptionId: originalId } });
  const legacy = await f.receipt();
  await updateFile(f.home.id, legacy.id, { name: "Original insurance policy.pdf" });
  const current = await f.receipt();
  await updateFile(f.home.id, current.id, { name: "Current insurance policy.pdf" });
  await attachFile(f.home.id, { fileId: legacy.id, entityType: "subscription", entityId: originalId });
  await attachFile(f.home.id, { fileId: current.id, entityType: "subscription", entityId: id });
  const detail = await getRecurringExpenseDetail(f.home.id, id);
  assert.deepEqual(detail.documentEntityIds, [id, originalId]);
  assert.equal((await getDocumentDetail(f.home.id, legacy.id)).links[0]!.href, `/expenses/recurring/${id}`);
  const linked = await call(f.user, "documents_linked", { on: "recurring_expense", name: id }, "read");
  assert.equal(linked.isError, false, linked.content[0]?.text);
  assert.match(linked.content[0]!.text, /Original insurance policy/);
  assert.match(linked.content[0]!.text, /Current insurance policy/);
  assert.equal((await call(foreign.user, "documents_linked", { on: "recurring_expense", name: id }, "read")).isError, true);
  assert.equal((await call({ ...f.user, role: "child" }, "documents_attach", { on: "recurring_expense", name: id, document: "Original insurance policy.pdf", detach: true, confirm: true })).isError, true);
  assert.equal((await call(f.user, "documents_attach", { on: "recurring_expense", name: id, document: "Original insurance policy.pdf", detach: true, confirm: true }, "read")).isError, true);
  const detached = await call(f.user, "documents_attach", { on: "recurring_expense", name: id, document: "Original insurance policy.pdf", detach: true, confirm: true });
  assert.equal(detached.isError, false, detached.content[0]?.text);
  assert.equal((await listLinkedFiles(f.home.id, { entityType: "subscription", entityId: originalId })).length, 0);
  assert.ok(await db.documentFile.findUnique({ where: { id: legacy.id } }));
  const attached = await call(f.user, "documents_attach", { on: "recurring_expense", name: id, document: "Original insurance policy.pdf", confirm: true });
  assert.equal(attached.isError, false, attached.content[0]?.text);
  assert.equal((await listLinkedFiles(f.home.id, { entityType: "subscription", entityId: id })).length, 2);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0);
  assert.equal((await getExpenseDetail(f.home.id, first.id)).expense.paidOn, null);
});

it("loan instalment and web/MCP extra repayments replan the partial last payment, undo/re-pay safely and debit each real payment once", options, async (t) => {
  const { deleteExpense } = await import("@/api/expenses/expenses.service");
  const f = await fixture(t);
  const today = todayIn();
  const account = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Loan account", kind: "JOINT", color: "#123456", isDefault: true } });
  const first = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Tracked household loan", amountCents: 3000, totalOpenCents: 10000, dueDate: today, category: "loans", kind: "loan", rrule: "FREQ=MONTHLY", payerType: "joint", paymentAccountId: account.id }));
  const id = first.recurringExpenseId!;
  await markExpensePaid(f.home.id, first.id, { paidOn: today });
  const partial = await createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Repaid loan", amountCents: 2000, earlyRepaymentForId: id, dueDate: today, paidOn: today, category: "loans", payerType: "joint", paymentMethod: "wire_transfer" }));
  const detail = await getRecurringExpenseDetail(f.home.id, id);
  assert.equal(detail.recurring.totalOpen!.remainingCents, 5000);
  assert.deepEqual(detail.upcoming.filter((row) => row.recurringExpenseId === id).map((row) => row.amountCents), [3000, 2000]);
  assert.equal((await getExpenseDetail(f.home.id, first.id)).expense.amountCents, 3000);
  const before = await db.expense.count({ where: { householdId: f.home.id } });
  await assert.rejects(createExpense(f.home.id, expenseCreateInputSchema.parse({ payee: "Too much", amountCents: 5001, earlyRepaymentForId: id, dueDate: today, category: "loans", payerType: "joint" })), (error: unknown) => error instanceof HttpError && error.status === 400 && Boolean(error.fields?.amountCents?.some((message) => message.includes("remaining balance"))));
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), before);
  assert.equal((await call({ ...f.user, role: "child" }, "expenses_log", { loan: id, amount: 50, date: today, confirm: true })).isError, true);
  assert.equal((await call(f.user, "expenses_log", { loan: id, amount: 50, date: today, confirm: true }, "read")).isError, true);
  const paidOff = await call(f.user, "expenses_log", { loan: id, amount: 50, date: today, confirm: true });
  assert.equal(paidOff.isError, false, paidOff.content[0]?.text);
  const payoff = await db.expense.findFirstOrThrow({ where: { householdId: f.home.id, earlyRepaymentForId: id, amountCents: 5000 } });
  const settled = await getRecurringExpenseDetail(f.home.id, id);
  assert.equal(settled.recurring.totalOpen!.remainingCents, 0);
  assert.equal(settled.recurring.monthlyCents, 0);
  assert.equal(settled.recurring.nextDueDate, null);
  assert.equal(settled.upcoming.length, 0);
  const ledger = async () => (await getMoneyMonth(f.home.id, today.slice(0, 7))).accountMonths.find((row) => row.accountId === account.id)!.lines.filter((row) => row.source === "expense" && !row.future);
  assert.deepEqual((await ledger()).map((row) => row.amountCents).sort((a, b) => a - b), [-5000, -3000, -2000]);
  assert.equal(await db.accountEntry.count({ where: { householdId: f.home.id } }), 0);
  await markExpenseUnpaid(f.home.id, payoff.id);
  assert.equal((await getRecurringExpenseDetail(f.home.id, id)).recurring.totalOpen!.remainingCents, 5000);
  assert.equal((await ledger()).reduce((sum, row) => sum + row.amountCents, 0), -5000);
  await markExpensePaid(f.home.id, payoff.id, { paidOn: today });
  assert.equal((await getRecurringExpenseDetail(f.home.id, id)).recurring.totalOpen!.remainingCents, 0);
  assert.equal((await ledger()).length, 3);
  await deleteExpense(f.home.id, payoff.id);
  await deleteExpense(f.home.id, partial.id);
  assert.equal((await getRecurringExpenseDetail(f.home.id, id)).recurring.totalOpen!.remainingCents, 7000);
  assert.equal((await ledger()).length, 1);
  assert.equal((await getExpenseDetail(f.home.id, first.id)).expense.paidOn, today);
});
