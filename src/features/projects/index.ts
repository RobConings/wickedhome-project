// Public API of the projects feature (Finance, phase 3). Routes, the app frame and other features import from here only.
//
// - Other features' forms: compose `<ProjectFormField defaultValue={record.project?.id} />` in their `projectField`
//   slot from the route (tasks, expenses and shopping never import projects). It posts `projectId`; empty removes it.
// - Money flow: `<ProjectBudgetsCard data={fetchProjectBudgetsSummary(month).catch(() => null)} />` (a deferred
//   promise from the loader) or `<ProjectBudgetsSummary month="YYYY-MM" />` (content only, loads its own data).
// - Calendar: projects with dates are a server-side calendar source (src/api/projects/projects.calendar.ts).
// - Materials on an invoice: the route gives the shopping panel the expenses' labels and `unlinkExpenseMaterial`.
// - Assistant: `ProjectPlanPreview` draws the planner's `project-plan` card (lazy, src/app/assistant-previews.ts).
export { ProjectBudgetBar } from "./components/project-budget-bar";
export { ProjectBudgetsCard } from "./components/project-budgets-card";
export { ProjectBudgetsSummary } from "./components/project-budgets-summary";
export { ProjectAvatar } from "./components/project-icon";
export { ProjectFormField, ProjectPicker } from "./components/project-picker";
export { default as ProjectPlanPreview } from "./components/project-plan-preview";
export type { LogExpenseRenderOptions, RenderLogExpense } from "./components/project-expenses-section";
export {
  projectAction,
  projectDetailLoader,
  projectsAction,
  projectsLoader,
  type ProjectDetailPageData,
  type ProjectsPageData,
} from "./data/projects-loaders";
export { fetchProjectBudgetsSummary, fetchProjects, unlinkExpenseMaterial } from "./data/projects-requests";
export { ProjectDetailScreen } from "./screens/project-detail-screen";
export { ProjectsScreen } from "./screens/projects-screen";
export { AT_RISK_RATIO, type ProjectBudget, type ProjectBudgetStatus } from "./types/project-budget";
export {
  canManageProjects,
  projectPath,
  type Project,
  type ProjectBudgetsSummaryData,
  type ProjectDetail,
  type ProjectRef,
  type ProjectStatus,
} from "./types/projects";
