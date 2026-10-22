// Public API of the tasks feature. Routes, the app frame and other features import from here only.
//
// - Place detail: render `<PlaceTasksSection placeId={place.id} />` (loads its own data).
// - Dashboard: `fetchTasksSummary()` → `TasksSummary` (counts plus the most urgent open tasks).
// - Calendar: open tasks with a due date are a server-side calendar source (src/api/tasks/tasks.source.ts).
// - Materials: the task detail route passes Shopping's `TaskMaterialsPanel` into `TaskDetailScreen`'s
//   `materials` slot; readiness comes from `getMaterialStatusForTasks` (src/api/tasks/task-materials.ts).
// - Linked tasks (bins per waste collection day, pay tasks per expense): other features create them server-side
//   with `upsertLinkedTask` (src/api/tasks/linked-tasks.ts). Show one on the origin's page by composing
//   `<LinkedTaskPanel originType="expense" originId={id} title={…} />` in the route (status, assignee, on hold,
//   blockers, comments, actions); `fetchLinkedHolds(originType)` tells which records' tasks are on hold.
// - `AssigneePicker`: avatar chips to pick habitants in order (rotation), e.g. for a feature's task settings.
export { AssigneePicker } from "./components/assignee-picker";
export { LinkedTaskPanel } from "./components/linked-task-panel";
export { PlaceTasksSection } from "./components/place-tasks-section";
// - Projects: `<ProjectTasksPanel projectId placeId onChanged />` on a project page (loads its own data); the task
//   forms take an optional `projectField` slot (`TaskProjectField`) that the routes fill with the project picker.
export { ProjectTasksPanel } from "./components/project-tasks-panel";
export type { TaskProjectField } from "./components/task-form-dialog";
export {
  taskDetailLoader,
  tasksAction,
  tasksLoader,
  tasksShouldRevalidate,
  type TaskDetailPageData,
  type TasksPageData,
} from "./data/tasks-loaders";
export { fetchLinkedHolds, fetchLinkedTask, fetchTasksOverview, fetchTasksSummary } from "./data/tasks-requests";
export { TaskDetailScreen } from "./screens/task-detail-screen";
export { TasksScreen } from "./screens/tasks-screen";
export {
  canManageTasks,
  taskPath,
  taskReadiness,
  type LinkedHolds,
  type Task,
  type TaskDetail,
  type TaskOrigin,
  type TaskReadiness,
  type TasksOverview,
  type TasksSummary,
} from "./types/tasks";
