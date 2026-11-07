import { createHash } from "node:crypto";
import type { SessionUser } from "@/features/auth/types/auth";
import type { ShoppingPaymentInput } from "@/features/expenses/types/shopping-payment";
import { createExpense } from "../expenses/expenses.service";
import { emitExpenseChanged } from "../expenses/expense-events";
import { db } from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { getShoppingSession, withShoppingSessionTransaction } from "./sessions.service";
const manager = (user: SessionUser) => { if (user.role === "child") throw forbidden("Only adults access shopping payments"); };

export async function getShoppingFinanceOptions(user: SessionUser) {
  manager(user);
  const [accounts, habitants, expenses] = await Promise.all([
    db.paymentAccount.findMany({ where: { householdId: user.householdId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.habitant.findMany({ where: { householdId: user.householdId, type: { in: ["ADULT", "CHILD"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.expense.findMany({ where: { householdId: user.householdId, paidOn: { not: null } }, select: { id: true, payee: true, amountCents: true, paidOn: true }, orderBy: { dueDate: "desc" }, take: 100 }),
  ]);
  return { accounts, habitants, expenses: expenses.map((expense) => ({ ...expense, paidOn: expense.paidOn?.toISOString().slice(0, 10) ?? null })) };
}

export async function recordShoppingPayment(user: SessionUser, sessionId: string, input: ShoppingPaymentInput) {
  manager(user);
  let createdExpenseId: string | undefined;
  await withShoppingSessionTransaction(user, sessionId, async (tx) => {
    const purchase = await tx.shoppingPurchase.findFirstOrThrow({ where: { sessionId, householdId: user.householdId } });
    const receipt = input.receiptId ? await tx.shoppingReceipt.findFirst({ where: { id: input.receiptId, purchaseId: purchase.id, householdId: user.householdId } }) : null;
    if (input.receiptId && !receipt) throw notFound("Receipt not found in this visit");
    const sourceKey = `${receipt ? `receipt:${receipt.contentHash}` : `visit:${purchase.id}`}:payment:${input.reference.toLocaleLowerCase("en")}`;
    const payloadHash = createHash("sha256").update(JSON.stringify({ expenseId: input.expenseId, expense: input.expense, paymentAccountId: input.paymentAccountId, paidByHabitantId: input.paidByHabitantId })).digest("hex");
    const prior = await tx.shoppingPayment.findUnique({ where: { householdId_sourceKey: { householdId: user.householdId, sourceKey } } });
    if (prior) {
      if (prior.payloadHash !== payloadHash) throw conflict("This payment reference already identifies different payment details");
      return;
    }
    if (input.expenseId) {
      const alreadyLinked = await tx.shoppingPayment.findUnique({ where: { expenseId: input.expenseId } });
      if (alreadyLinked) {
        if (alreadyLinked.purchaseId !== purchase.id || alreadyLinked.receiptId && alreadyLinked.receiptId !== receipt?.id) throw conflict("This expense already belongs to another visit or receipt");
        if (receipt && !alreadyLinked.receiptId) await tx.shoppingPayment.update({ where: { id: alreadyLinked.id }, data: { receiptId: receipt.id } });
        return;
      }
    }
    if (input.paymentAccountId && !await tx.paymentAccount.count({ where: { id: input.paymentAccountId, householdId: user.householdId, archived: false } })) throw notFound("Payment account not found");
    if (input.paidByHabitantId && !await tx.habitant.count({ where: { id: input.paidByHabitantId, householdId: user.householdId } })) throw notFound("Payer not found");
    const existing = input.expenseId ? await tx.expense.findFirst({ where: { id: input.expenseId, householdId: user.householdId } }) : null;
    if (input.expenseId && !existing) throw notFound("Expense not found");
    if (existing && !existing.paidOn) throw badRequest("Mark the existing expense paid before linking a payment");
    if (input.expense && (!input.expense.paidOn || input.expense.rrule || input.expense.earlyRepaymentForId)) throw badRequest("A shopping payment needs an actual paid date and a one-off expense");
    const amountCents = existing?.amountCents ?? input.expense!.amountCents;
    const payments = await tx.shoppingPayment.findMany({ where: { purchaseId: purchase.id }, include: { expense: { select: { amountCents: true } } } });
    const paid = (rows: typeof payments) => rows.reduce((sum, row) => sum + (row.expense?.amountCents ?? row.amountCents), 0);
    if (purchase.totalCents !== null && paid(payments) + amountCents > purchase.totalCents) throw conflict("Payments would exceed the receipt total. Link the existing expense instead of registering it again.");
    if (receipt?.totalCents !== null && receipt?.totalCents !== undefined && paid(payments.filter((row) => row.receiptId === receipt.id)) + amountCents > receipt.totalCents) throw conflict("These payments exceed this receipt's total");
    const expense = existing ?? await createExpense(user.householdId, input.expense!, tx);
    if (!existing) {
      createdExpenseId = expense.id;
      await tx.expense.update({ where: { id: expense.id }, data: { paymentAccountId: input.paymentAccountId, paidById: input.paidByHabitantId } });
    }
    await tx.shoppingPayment.create({ data: { householdId: user.householdId, purchaseId: purchase.id, receiptId: receipt?.id, expenseId: expense.id, originalExpenseId: expense.id, sourceKey, payloadHash, amountCents } });
  }, true);
  if (createdExpenseId) await emitExpenseChanged(user.householdId, createdExpenseId, "created");
  return getShoppingSession(user, sessionId);
}

export async function shoppingSessionsForExpense(user: SessionUser, expenseId: string) {
  manager(user);
  if (!await db.expense.count({ where: { id: expenseId, householdId: user.householdId } })) throw notFound("Expense not found");
  return (await db.shoppingSession.findMany({ where: { householdId: user.householdId, purchases: { some: { payments: { some: { expenseId } } } } }, orderBy: { startedAt: "desc" } })).map((row) => ({ id: row.id, name: row.name }));
}
