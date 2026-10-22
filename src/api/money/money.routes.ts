import { Router } from "express";
import {
  accountCreateSchema,
  accountUpdateSchema,
  contributionPlanSchema,
  directPaymentSchema,
  keepExtraSchema,
  MAX_TIMELINE_MONTHS,
  moneyMonthSchema,
  otherEntrySchema,
  planAmountsSchema,
  recordTransferSchema,
  setBalanceSchema,
  takeBackSchema,
  TIMELINE_MONTHS_AHEAD,
  TIMELINE_MONTHS_BACK,
} from "@/features/money/types/money";
import { monthsBetween } from "@/features/money/types/money-timeline";
import { idSchema } from "@/types/common";
import { addMonthsClamped, monthOf, todayIn } from "@/types/dates";
import { appActor } from "../audit/audit.service";
import { badRequest, parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  addOtherEntry,
  createAccount,
  createPlan,
  deleteEntry,
  deletePlan,
  getMoneyLoans,
  getMoneyMonth,
  getMoneySummary,
  getMoneyTimeline,
  listJointAccounts,
  recordDirectPayment,
  recordTransfer,
  setBalance,
  setKeptExtra,
  setPlanAmounts,
  takeBackContribution,
  updateAccount,
  updatePlan,
} from "./money.service";

export const moneyRouter = Router();

moneyRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

const shiftMonth = (month: string, months: number) => monthOf(addMonthsClamped(`${month}-01`, months));

/** `?month=YYYY-MM`, default the current month. */
const monthParam = (value: unknown) => (value === undefined || value === "" ? monthOf(todayIn()) : parse(moneyMonthSchema, value));

moneyRouter.get("/", async (req, res) => {
  res.json(await getMoneyMonth(currentUser(req).householdId, monthParam(req.query.month)));
});

moneyRouter.get("/summary", async (req, res) => {
  res.json(await getMoneySummary(currentUser(req).householdId));
});

moneyRouter.get("/loans", async (req, res) => {
  res.json(await getMoneyLoans(currentUser(req).householdId));
});

/** `?from=YYYY-MM&to=YYYY-MM`, default 12 months back to 24 ahead; at most MAX_TIMELINE_MONTHS months. */
moneyRouter.get("/timeline", async (req, res) => {
  const current = monthOf(todayIn());
  const from = req.query.from ? parse(moneyMonthSchema, req.query.from) : shiftMonth(current, -TIMELINE_MONTHS_BACK);
  const to = req.query.to ? parse(moneyMonthSchema, req.query.to) : shiftMonth(current, TIMELINE_MONTHS_AHEAD);
  if (to < from || monthsBetween(from, to).length > MAX_TIMELINE_MONTHS) {
    throw badRequest("Validation failed", { to: [`From 1 to ${MAX_TIMELINE_MONTHS} months after from`] });
  }
  res.json(await getMoneyTimeline(currentUser(req).householdId, from, to));
});

moneyRouter.get("/accounts", async (req, res) => {
  res.json(await listJointAccounts(currentUser(req).householdId));
});

moneyRouter.post("/accounts", canManage, async (req, res) => {
  const user = currentUser(req);
  const input = parse(accountCreateSchema, req.body);
  res.status(201).json(await createAccount(user.householdId, user.id, input));
});

moneyRouter.put("/accounts/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(accountUpdateSchema, req.body);
  res.json(await updateAccount(currentUser(req).householdId, id, input));
});

moneyRouter.post("/accounts/:id/balance", canManage, async (req, res) => {
  const user = currentUser(req);
  const id = parse(idSchema, req.params.id);
  const input = parse(setBalanceSchema, req.body);
  await setBalance(user.householdId, user.id, id, input, appActor(user));
  res.status(201).json({ ok: true });
});

moneyRouter.post("/accounts/:id/entries", canManage, async (req, res) => {
  const user = currentUser(req);
  const id = parse(idSchema, req.params.id);
  const input = parse(otherEntrySchema, req.body);
  await addOtherEntry(user.householdId, user.id, id, input);
  res.status(201).json({ ok: true });
});

moneyRouter.post("/transfers", canManage, async (req, res) => {
  const user = currentUser(req);
  const input = parse(recordTransferSchema, req.body);
  await recordTransfer(user.householdId, user.id, input);
  res.status(201).json({ ok: true });
});

moneyRouter.delete("/entries/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const user = currentUser(req);
  await deleteEntry(user.householdId, id, appActor(user));
  res.status(204).end();
});

/** Settling the month: take an over-contribution back (a negative contribution). */
moneyRouter.post("/contributions/take-back", canManage, async (req, res) => {
  const user = currentUser(req);
  await takeBackContribution(user.householdId, user.id, parse(takeBackSchema, req.body));
  res.status(201).json({ ok: true });
});

/** Settling the month: keep a surplus as extra (`amountCents` 0 flags it again). */
moneyRouter.put("/contributions/extra", canManage, async (req, res) => {
  const user = currentUser(req);
  await setKeptExtra(user.householdId, user.id, parse(keepExtraSchema, req.body));
  res.json({ ok: true });
});

/** Settling the month: one person paid another directly (the netting alternative). */
moneyRouter.post("/contributions/direct", canManage, async (req, res) => {
  const user = currentUser(req);
  await recordDirectPayment(user.householdId, user.id, parse(directPaymentSchema, req.body));
  res.status(201).json({ ok: true });
});

/** New plan amounts from the first day of a month (the coverage check's "Update plans"). */
moneyRouter.post("/plans/amounts", canManage, async (req, res) => {
  await setPlanAmounts(currentUser(req).householdId, parse(planAmountsSchema, req.body));
  res.json({ ok: true });
});

moneyRouter.post("/plans", canManage, async (req, res) => {
  const input = parse(contributionPlanSchema, req.body);
  res.status(201).json(await createPlan(currentUser(req).householdId, input));
});

moneyRouter.put("/plans/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(contributionPlanSchema, req.body);
  res.json(await updatePlan(currentUser(req).householdId, id, input));
});

moneyRouter.delete("/plans/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deletePlan(currentUser(req).householdId, id);
  res.status(204).end();
});
