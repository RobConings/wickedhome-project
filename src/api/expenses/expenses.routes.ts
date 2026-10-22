import { Router } from "express";
import {
  expenseCreateInputSchema,
  expenseInputSchema,
  expensePaymentInputSchema,
  recurringExpenseInputSchema,
  recurringStatusInputSchema,
} from "@/features/expenses/types/expenses";
import { idSchema } from "@/types/common";
import { addDays, todayIn } from "@/types/dates";
import { registerCalendarSource } from "../calendar/calendar-sources";
import { notFound, parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { expensesCalendarSource } from "./expenses.calendar";
import {
  createExpense,
  deleteExpense,
  deleteRecurringExpense,
  findRecurringForSubscription,
  getExpenseDetail,
  getExpensesOverview,
  getExpensesSummary,
  getRecurringExpenseDetail,
  listUnpaidExpenses,
  markExpensePaid,
  markExpenseUnpaid,
  setRecurringStatus,
  updateExpense,
  updateRecurringExpense,
} from "./expenses.service";
import "./expenses.jobs";

registerCalendarSource(expensesCalendarSource);

/** How far ahead `GET /unpaid` looks. */
const UNPAID_DAYS = 62;

export const expensesRouter = Router();

expensesRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

expensesRouter.get("/", async (req, res) => {
  res.json(await getExpensesOverview(currentUser(req).householdId));
});

expensesRouter.get("/summary", async (req, res) => {
  res.json(await getExpensesSummary(currentUser(req).householdId));
});

/** Unpaid expenses due within two months (overdue included), for "Next to pay" on other pages (money flow). */
expensesRouter.get("/unpaid", async (req, res) => {
  res.json(await listUnpaidExpenses(currentUser(req).householdId, addDays(todayIn(), UNPAID_DAYS)));
});

expensesRouter.post("/", canManage, async (req, res) => {
  const input = parse(expenseCreateInputSchema, req.body);
  res.status(201).json(await createExpense(currentUser(req).householdId, input));
});

// Recurring routes have two or more path segments, so they never collide with `/:id`.
expensesRouter.get("/recurring/by-subscription/:subscriptionId", async (req, res) => {
  const subscriptionId = parse(idSchema, req.params.subscriptionId);
  const found = await findRecurringForSubscription(currentUser(req).householdId, subscriptionId);
  if (!found) throw notFound("No recurring expense for this subscription");
  res.json(found);
});

expensesRouter.get("/recurring/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getRecurringExpenseDetail(currentUser(req).householdId, id));
});

expensesRouter.put("/recurring/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(recurringExpenseInputSchema, req.body);
  res.json(await updateRecurringExpense(currentUser(req).householdId, id, input));
});

expensesRouter.put("/recurring/:id/status", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(recurringStatusInputSchema, req.body);
  res.json(await setRecurringStatus(currentUser(req).householdId, id, input));
});

expensesRouter.delete("/recurring/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteRecurringExpense(currentUser(req).householdId, id);
  res.status(204).end();
});

expensesRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getExpenseDetail(currentUser(req).householdId, id));
});

expensesRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(expenseInputSchema, req.body);
  res.json(await updateExpense(currentUser(req).householdId, id, input));
});

expensesRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteExpense(currentUser(req).householdId, id);
  res.status(204).end();
});

expensesRouter.put("/:id/payment", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(expensePaymentInputSchema, req.body);
  res.json(await markExpensePaid(currentUser(req).householdId, id, input));
});

expensesRouter.delete("/:id/payment", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await markExpenseUnpaid(currentUser(req).householdId, id));
});
