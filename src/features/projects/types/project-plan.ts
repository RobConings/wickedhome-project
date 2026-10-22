import { z } from "zod";
import { budgetStatus, materialLine, type ProjectBudgetStatus } from "./project-budget";

// The assistant's project plan (`kind: "project-plan"` on a confirmation card): a whole home project as the
// assistant proposes it (the project, its tasks in order with "waits for", its materials and the budget), so
// the person reviews everything before one Apply creates it. Built on the server (ai/skills/planner), drawn by
// `ProjectPlanPreview` in the browser. Names only, no ids; task numbers start at 1 (as on the card).

export const PROJECT_PLAN_KIND = "project-plan";
export const MAX_PLAN_TASKS = 40;
export const MAX_PLAN_MATERIALS = 80;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const taskNumber = z.number().int().min(1).max(MAX_PLAN_TASKS);

export const projectPlanDataSchema = z.object({
  project: z.object({
    name: z.string().max(80),
    /** Adding to a project that already exists (only adds; nothing is removed). */
    existing: z.boolean(),
    budgetCents: z.number().int().min(0).nullable(),
    /** What the existing project already spent and committed (0 for a new one). */
    usedCents: z.number().int().min(0),
    start: isoDate.nullable(),
    end: isoDate.nullable(),
    places: z.array(z.string().max(80)).max(20),
    /** Contractor or supplier, as a name. */
    contact: z.string().max(160).nullable(),
    notes: z.string().max(2000).nullable(),
  }),
  tasks: z
    .array(
      z.object({
        title: z.string().max(120),
        place: z.string().max(80).nullable(),
        who: z.array(z.string().max(80)).max(10),
        due: isoDate.nullable(),
        /** Numbers of the tasks of this plan that must be done first. */
        waitsFor: z.array(taskNumber).max(10),
        hours: z.number().min(0).max(1000).nullable(),
        /** How many checklist items. */
        checklist: z.number().int().min(0).max(50),
      }),
    )
    .max(MAX_PLAN_TASKS),
  materials: z
    .array(
      z.object({
        name: z.string().max(120),
        quantity: z.number().positive().max(100_000),
        unit: z.string().max(20).nullable(),
        /** The task (number) it is for, or null for the project as a whole. */
        task: taskNumber.nullable(),
        shop: z.string().max(80).nullable(),
        url: z.string().max(1000).nullable(),
        /** Estimated price per unit (an estimate unless it came from a webshop page). */
        priceCents: z.number().int().min(0).nullable(),
      }),
    )
    .max(MAX_PLAN_MATERIALS),
  /** Things to look at before applying (a date after the deadline…), in the person's language. */
  warnings: z.array(z.string().max(300)).max(20),
});
export type ProjectPlanData = z.infer<typeof projectPlanDataSchema>;
export type ProjectPlanMaterial = ProjectPlanData["materials"][number];

/** Price × quantity of a plan material, rounded to cents; null without a price. */
export const planMaterialCents = (material: Pick<ProjectPlanMaterial, "priceCents" | "quantity">): number | null =>
  materialLine({ priceCents: material.priceCents, quantity: material.quantity, shopId: null, productPrices: [] }).lineCents;

export type ProjectPlanTotals = {
  /** Sum of the priced materials. */
  materialsCents: number;
  /** Materials without a price (not counted). */
  unpriced: number;
  budgetCents: number | null;
  /** Already used by an existing project + the plan's materials. */
  totalCents: number;
  /** Budget − total; negative when over. Null without a budget. */
  remainingCents: number | null;
  status: ProjectBudgetStatus;
};

/** The plan's material estimate against the budget, the way the project's budget will count it. */
export function planTotals(data: Pick<ProjectPlanData, "project" | "materials">): ProjectPlanTotals {
  const lines = data.materials.map(planMaterialCents);
  const materialsCents = lines.reduce<number>((sum, line) => sum + (line ?? 0), 0);
  const totalCents = data.project.usedCents + materialsCents;
  const { budgetCents } = data.project;
  return {
    materialsCents,
    unpriced: lines.filter((line) => line === null).length,
    budgetCents,
    totalCents,
    remainingCents: budgetCents === null ? null : budgetCents - totalCents,
    status: budgetStatus(budgetCents, totalCents),
  };
}

export type PlanMaterialGrouping = "task" | "shop";
export type PlanMaterialGroup = { key: string; label: string; materials: ProjectPlanMaterial[] };

/** Materials by task (in task order, the project's own last) or by shop (most first, no shop last). */
export function groupPlanMaterials(
  data: Pick<ProjectPlanData, "tasks" | "materials">,
  by: PlanMaterialGrouping,
  labels: { wholeProject: string; noShop: string },
): PlanMaterialGroup[] {
  const groups = new Map<string, PlanMaterialGroup>();
  for (const material of data.materials) {
    const key = by === "task" ? (material.task === null ? "" : String(material.task)) : (material.shop ?? "");
    const label =
      by === "task"
        ? material.task === null
          ? labels.wholeProject
          : `${material.task}. ${data.tasks[material.task - 1]?.title ?? ""}`
        : (material.shop ?? labels.noShop);
    const group = groups.get(key) ?? { key, label, materials: [] };
    group.materials.push(material);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  const noneLast = (a: PlanMaterialGroup, b: PlanMaterialGroup) => (a.key === "" ? 1 : b.key === "" ? -1 : 0);
  return by === "task"
    ? list.sort((a, b) => noneLast(a, b) || Number(a.key) - Number(b.key))
    : list.sort((a, b) => noneLast(a, b) || b.materials.length - a.materials.length || a.label.localeCompare(b.label));
}
