import assert from "node:assert/strict";
import { after, it, type TestContext } from "node:test";
import { shoppingPaymentSchema } from "@/features/expenses/types/shopping-payment";
import { expenseCreateInputSchema } from "@/features/expenses/types/expenses";
import { todayIn } from "@/types/dates";
import { db } from "../lib/db";
import { createExpense } from "../expenses/expenses.service";
import { shoppingSessionFixture } from "./sessions-test-helpers";
import { attachShoppingReceipt, getShoppingSession, updateShoppingSessionItem } from "./sessions.service";
import { getShoppingFinanceOptions, recordShoppingPayment, shoppingSessionsForExpense } from "./session-payments.service";
const enabled = process.env.SHOPPING_INTEGRATION_TESTS === "1";
const options = { skip: !enabled };
after(async () => { if (enabled) await db.$disconnect(); });
const expense = (amountCents: number) => expenseCreateInputSchema.parse({ payee: "Colruyt", amountCents, category: "groceries", paymentMethod: "card", dueDate: todayIn(), paidOn: todayIn(), payerType: "joint" });
async function fixture(t: TestContext) {
  const f = await shoppingSessionFixture(t); let visit = await f.start();
  visit = await updateShoppingSessionItem(f.user, visit.id, visit.items[0]!.id, { revision: 0, operationId: "buy", status: "bought" });
  const doc = await f.receipt();
  visit = await attachShoppingReceipt(f.user, visit.id, { documentId: doc.id, purchasedAt: new Date().toISOString(), totalCents: 1000 });
  return { ...f, visit, receiptId: visit.purchases[0]!.receipts[0]!.id };
}

it("receipt attachment creates no expense; concurrent payment retries create exactly one expense and preserve stock", options, async (t) => {
  const f = await fixture(t);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
  const input = shoppingPaymentSchema.parse({ reference: "card-1", receiptId: f.receiptId, expense: expense(1000) });
  await Promise.all([recordShoppingPayment(f.user, f.visit.id, input), recordShoppingPayment(f.user, f.visit.id, input)]);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 1);
  assert.equal(await db.shoppingPayment.count({ where: { householdId: f.home.id } }), 1);
  assert.equal(await f.quantity(), 2);
  await assert.rejects(recordShoppingPayment(f.user, f.visit.id, { ...input, expense: expense(900) }), /reference/);
});

it("split payments retain payer, account and receipt links with navigation back to the visit", options, async (t) => {
  const f = await fixture(t);
  const rob = await db.habitant.create({ data: { householdId: f.home.id, name: "Rob", type: "ADULT", color: "#123456" } });
  const account = await db.paymentAccount.create({ data: { householdId: f.home.id, name: "Joint account", kind: "JOINT", color: "#123456" } });
  await recordShoppingPayment(f.user, f.visit.id, shoppingPaymentSchema.parse({ reference: "card-1", receiptId: f.receiptId, paymentAccountId: account.id, paidByHabitantId: rob.id, expense: expense(600) }));
  await recordShoppingPayment(f.user, f.visit.id, shoppingPaymentSchema.parse({ reference: "personal-1", receiptId: f.receiptId, expense: { ...expense(400), payerType: "person", payerHabitantId: rob.id } }));
  const visit = await getShoppingSession(f.user, f.visit.id);
  assert.equal(visit.purchases[0]!.payments.reduce((sum, payment) => sum + payment.amountCents, 0), 1000);
  const paid = await db.expense.findFirstOrThrow({ where: { householdId: f.home.id, amountCents: 600 } });
  assert.equal(paid.paymentAccountId, account.id); assert.equal(paid.paidById, rob.id);
  assert.deepEqual((await shoppingSessionsForExpense(f.user, paid.id)).map((row) => row.id), [f.visit.id]);
  const child = { ...f.user, role: "child" as const };
  assert.deepEqual((await getShoppingSession(child, f.visit.id)).purchases[0]!.payments, []);
  await assert.rejects(getShoppingFinanceOptions(child), /Only adults/);
});

it("linking a paid expense twice never creates a replacement or counts the expense twice", options, async (t) => {
  const f = await fixture(t); const old = await createExpense(f.home.id, expense(1000));
  await recordShoppingPayment(f.user, f.visit.id, shoppingPaymentSchema.parse({ reference: "existing-1", expenseId: old.id }));
  await recordShoppingPayment(f.user, f.visit.id, shoppingPaymentSchema.parse({ reference: "receipt-link", receiptId: f.receiptId, expenseId: old.id }));
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 1);
  const payments = await db.shoppingPayment.findMany({ where: { householdId: f.home.id } });
  assert.equal(payments.length, 1); assert.equal(payments[0]?.receiptId, f.receiptId);
});

it("overpayment and foreign accounts are rejected without orphan expenses", options, async (t) => {
  const f = await fixture(t);
  await assert.rejects(recordShoppingPayment(f.user, f.visit.id, shoppingPaymentSchema.parse({ reference: "over", receiptId: f.receiptId, expense: expense(1001) })), /exceed/);
  await assert.rejects(recordShoppingPayment(f.user, f.visit.id, shoppingPaymentSchema.parse({ reference: "foreign", paymentAccountId: "another-household", expense: expense(1000) })), /not found/);
  assert.equal(await db.expense.count({ where: { householdId: f.home.id } }), 0);
  assert.equal(await f.quantity(), 2);
});

it("one shared expense can retain the existing split-share model", options, async (t) => {
  const f = await fixture(t);
  const people = await Promise.all(["Rob", "Cindy"].map((name) => db.habitant.create({ data: { householdId: f.home.id, name, type: "ADULT", color: "#123456" } })));
  const input = shoppingPaymentSchema.parse({ reference: "split-shares", receiptId: f.receiptId, expense: { ...expense(1000), payerType: "split", shares: people.map((person) => ({ habitantId: person.id, amountCents: 500 })) } });
  await recordShoppingPayment(f.user, f.visit.id, input);
  const row = await db.expense.findFirstOrThrow({ where: { householdId: f.home.id }, include: { shares: true } });
  assert.equal(row.payerType, "SPLIT"); assert.equal(row.shares.length, 2);
});
