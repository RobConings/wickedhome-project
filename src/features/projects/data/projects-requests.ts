import { api } from "@/lib/api-client";
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

const path = (id: string) => `/projects/${encodeURIComponent(id)}`;

/** Every project with its budget and task counts, running ones first. */
export const fetchProjects = () => api.get<ProjectsOverview>("/projects");
export const fetchProjectDetail = (id: string) => api.get<ProjectDetail>(path(id));
/** Running projects with their budget for a month (`YYYY-MM`, default this month): for the money flow page. */
export const fetchProjectBudgetsSummary = (month?: string) =>
  api.get<ProjectBudgetsSummaryData>(`/projects/summary${month ? `?month=${encodeURIComponent(month)}` : ""}`);
/** Unlinked open tasks, one-off expenses and recurring expenses that could join a project. */
export const fetchProjectCandidates = () => api.get<ProjectCandidates>("/projects/candidates");

export const createProject = (input: ProjectInput) => api.post<Project>("/projects", input);
export const updateProject = (id: string, input: ProjectInput) => api.put<Project>(path(id), input);
export const setProjectStatus = (id: string, input: ProjectStatusInput) => api.post<Project>(`${path(id)}/status`, input);
export const setProjectCover = (id: string, input: ProjectCoverInput) => api.put<Project>(`${path(id)}/cover`, input);
export const deleteProject = (id: string) => api.delete(path(id));
export const linkToProject = (id: string, input: ProjectLinkInput) => api.post(`${path(id)}/links`, input);
export const unlinkFromProject = (id: string, input: ProjectLinkInput) =>
  api.delete(`${path(id)}/links/${input.kind}/${encodeURIComponent(input.id)}`);
export const recordProjectPurchase = (id: string, input: ProjectPurchaseInput) => api.post(`${path(id)}/purchases`, input);
/** The materials on an invoice (expense) of the project, as a whole ("Link materials"). */
export const setExpenseMaterials = (id: string, expenseId: string, input: ProjectExpenseMaterialsInput) =>
  api.put(`${path(id)}/expenses/${encodeURIComponent(expenseId)}/materials`, input);
/** Takes one material off its invoice (it stays bought). */
export const unlinkExpenseMaterial = (id: string, expenseId: string, itemId: string) =>
  api.delete(`${path(id)}/expenses/${encodeURIComponent(expenseId)}/materials/${encodeURIComponent(itemId)}`);
/** "Read invoice with AI": the invoice's lines and the materials on them, proposed (slow: a model call, up to ~90 s). */
export const readProjectInvoice = (id: string, expenseId: string) =>
  api.post<ProjectInvoiceReading>(`${path(id)}/expenses/${encodeURIComponent(expenseId)}/read-invoice`);
