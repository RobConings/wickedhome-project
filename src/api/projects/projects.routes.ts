import { Router } from "express";
import {
  projectCoverInputSchema,
  projectExpenseMaterialsInputSchema,
  projectInputSchema,
  projectLinkInputSchema,
  projectLinkKindSchema,
  projectPurchaseInputSchema,
  projectStatusInputSchema,
  projectSummaryQuerySchema,
} from "@/features/projects/types/projects";
import { idSchema } from "@/types/common";
import { registerCalendarSource } from "../calendar/calendar-sources";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { readProjectInvoice } from "./project-invoices";
import { projectsCalendarSource } from "./projects.calendar";
import {
  createProject,
  deleteProject,
  getProjectBudgetsSummary,
  getProjectCandidates,
  getProjectDetail,
  linkExpenseMaterials,
  linkToProject,
  listProjects,
  recordProjectPurchase,
  setProjectCover,
  setProjectStatus,
  unlinkExpenseMaterial,
  unlinkFromProject,
  updateProject,
} from "./projects.service";

registerCalendarSource(projectsCalendarSource);

export const projectsRouter = Router();

projectsRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

projectsRouter.get("/", async (req, res) => {
  res.json(await listProjects(currentUser(req).householdId));
});

// Running projects with their budget for one month (the money flow page).
projectsRouter.get("/summary", async (req, res) => {
  const query = parse(projectSummaryQuerySchema, req.query);
  res.json(await getProjectBudgetsSummary(currentUser(req).householdId, query.month));
});

projectsRouter.get("/candidates", canManage, async (req, res) => {
  res.json(await getProjectCandidates(currentUser(req).householdId));
});

projectsRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getProjectDetail(currentUser(req).householdId, id));
});

projectsRouter.post("/", canManage, async (req, res) => {
  const input = parse(projectInputSchema, req.body);
  res.status(201).json(await createProject(currentUser(req).householdId, input));
});

projectsRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(projectInputSchema, req.body);
  res.json(await updateProject(currentUser(req).householdId, id, input));
});

projectsRouter.post("/:id/status", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(projectStatusInputSchema, req.body);
  res.json(await setProjectStatus(currentUser(req).householdId, id, input));
});

projectsRouter.put("/:id/cover", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(projectCoverInputSchema, req.body);
  res.json(await setProjectCover(currentUser(req).householdId, id, input));
});

projectsRouter.post("/:id/links", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(projectLinkInputSchema, req.body);
  await linkToProject(currentUser(req).householdId, id, input);
  res.status(204).end();
});

projectsRouter.delete("/:id/links/:kind/:itemId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = { kind: parse(projectLinkKindSchema, req.params.kind), id: parse(idSchema, req.params.itemId) };
  await unlinkFromProject(currentUser(req).householdId, id, input);
  res.status(204).end();
});

projectsRouter.post("/:id/purchases", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(projectPurchaseInputSchema, req.body);
  await recordProjectPurchase(currentUser(req).householdId, id, input);
  res.status(204).end();
});

// The materials on an invoice (expense) of the project, as a whole ("Link materials").
projectsRouter.put("/:id/expenses/:expenseId/materials", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const expenseId = parse(idSchema, req.params.expenseId);
  const input = parse(projectExpenseMaterialsInputSchema, req.body);
  await linkExpenseMaterials(currentUser(req), id, expenseId, input);
  res.status(204).end();
});

projectsRouter.delete("/:id/expenses/:expenseId/materials/:itemId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const expenseId = parse(idSchema, req.params.expenseId);
  const itemId = parse(idSchema, req.params.itemId);
  await unlinkExpenseMaterial(currentUser(req).householdId, id, expenseId, itemId);
  res.status(204).end();
});

// "Read invoice with AI": the invoice's lines and the materials on them, proposed (nothing changes). Slow (a model call).
projectsRouter.post("/:id/expenses/:expenseId/read-invoice", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const expenseId = parse(idSchema, req.params.expenseId);
  const controller = new AbortController();
  // The person closed the dialog or the page: stop waiting for the model.
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  res.json(await readProjectInvoice(currentUser(req).householdId, id, expenseId, controller.signal));
});

projectsRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteProject(currentUser(req).householdId, id);
  res.status(204).end();
});
