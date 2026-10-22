import { api, restResource, withQuery } from "@/lib/api-client";
import type {
  Project,
  ProjectBudgetsSummaryData,
  ProjectCandidates,
  ProjectCoverInput,
  ProjectDetail,
  ProjectExpenseMaterialsInput,
  ProjectInput,
  ProjectInvoiceReading,
  ProjectLinkInput,
  ProjectPurchaseInput,
  ProjectsOverview,
  ProjectStatusInput,
} from "../types/projects";

const projects = restResource<Project, ProjectInput, ProjectDetail>("/projects");
const path = projects.path;

/** Every project with its budget and task counts, running ones first. */
export const fetchProjects = () => api.get<ProjectsOverview>("/projects");
export const fetchProjectDetail = projects.get;
/** Running projects with their budget for a month (`YYYY-MM`, default this month): for the money flow page. */
export const fetchProjectBudgetsSummary = (month?: string) =>
  api.get<ProjectBudgetsSummaryData>(withQuery("/projects/summary", { month }));
/** Unlinked open tasks, one-off expenses and recurring expenses that could join a project. */
export const fetchProjectCandidates = () => api.get<ProjectCandidates>("/projects/candidates");

export const createProject = projects.create;
export const updateProject = projects.update;
export const setProjectStatus = (id: string, input: ProjectStatusInput) => api.post<Project>(`${path(id)}/status`, input);
export const setProjectCover = (id: string, input: ProjectCoverInput) => api.put<Project>(`${path(id)}/cover`, input);
export const deleteProject = projects.remove;
export const linkToProject = (id: string, input: ProjectLinkInput) => api.post(`${path(id)}/links`, input);
export const unlinkFromProject = (id: string, input: ProjectLinkInput) =>
  api.delete(path(id, "links", input.kind, input.id));
export const recordProjectPurchase = (id: string, input: ProjectPurchaseInput) => api.post(`${path(id)}/purchases`, input);
/** The materials on an invoice (expense) of the project, as a whole ("Link materials"). */
export const setExpenseMaterials = (id: string, expenseId: string, input: ProjectExpenseMaterialsInput) =>
  api.put(path(id, "expenses", expenseId, "materials"), input);
/** Takes one material off its invoice (it stays bought). */
export const unlinkExpenseMaterial = (id: string, expenseId: string, itemId: string) =>
  api.delete(path(id, "expenses", expenseId, "materials", itemId));
/** "Read invoice with AI": the invoice's lines and the materials on them, proposed (slow: a model call, up to ~90 s). */
export const readProjectInvoice = (id: string, expenseId: string) =>
  api.post<ProjectInvoiceReading>(path(id, "expenses", expenseId, "read-invoice"));
