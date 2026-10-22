import { BrushCleaningIcon, FootprintsIcon, HammerIcon, ListTodoIcon, WrenchIcon, type LucideIcon } from "lucide-react";
import type { TaskType } from "../types/tasks";

/** One icon per task type, used in lists, filters, the form and the detail page. */
export const TASK_TYPE_ICONS: Record<TaskType, LucideIcon> = {
  chore: BrushCleaningIcon,
  todo: ListTodoIcon,
  job: HammerIcon,
  maintenance: WrenchIcon,
  errand: FootprintsIcon,
};
