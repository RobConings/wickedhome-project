import { Router } from "express";
import {
  incomeAmountInputSchema,
  incomeInputSchema,
  incomeSourceCreateSchema,
  incomeSourceUpdateSchema,
  monthSchema,
} from "@/features/income/types/income";
import { idSchema } from "@/types/common";
import { monthOf, todayIn } from "@/types/dates";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  addIncomeAmount,
  createIncome,
  createIncomeSource,
  deleteIncome,
  deleteIncomeAmount,
  deleteIncomeSource,
  getIncomeOverview,
  updateIncome,
  updateIncomeSource,
} from "./income.service";
import "./income.jobs";
// "Meal vouchers expire soon" notifications (docs/NOTIFICATIONS.md).
import "./income.notifications";

export const incomeRouter = Router();

incomeRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

/** `?month=YYYY-MM`, default the current month. */
const monthParam = (value: unknown) => (value === undefined || value === "" ? monthOf(todayIn()) : parse(monthSchema, value));

incomeRouter.get("/", async (req, res) => {
  res.json(await getIncomeOverview(currentUser(req).householdId, monthParam(req.query.month)));
});

incomeRouter.post("/sources", canManage, async (req, res) => {
  const input = parse(incomeSourceCreateSchema, req.body);
  res.status(201).json(await createIncomeSource(currentUser(req).householdId, input));
});

incomeRouter.put("/sources/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(incomeSourceUpdateSchema, req.body);
  res.json(await updateIncomeSource(currentUser(req).householdId, id, input));
});

incomeRouter.delete("/sources/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteIncomeSource(currentUser(req).householdId, id);
  res.status(204).end();
});

incomeRouter.post("/sources/:id/amounts", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(incomeAmountInputSchema, req.body);
  res.json(await addIncomeAmount(currentUser(req).householdId, id, input));
});

incomeRouter.delete("/sources/:id/amounts/:amountId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const amountId = parse(idSchema, req.params.amountId);
  res.json(await deleteIncomeAmount(currentUser(req).householdId, id, amountId));
});

incomeRouter.post("/incomes", canManage, async (req, res) => {
  const input = parse(incomeInputSchema, req.body);
  res.status(201).json(await createIncome(currentUser(req).householdId, input));
});

incomeRouter.put("/incomes/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(incomeInputSchema, req.body);
  res.json(await updateIncome(currentUser(req).householdId, id, input));
});

incomeRouter.delete("/incomes/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteIncome(currentUser(req).householdId, id);
  res.status(204).end();
});
