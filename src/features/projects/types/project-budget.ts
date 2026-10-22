/*
 * Project budgets: pure maths shared by the API and the UI (tested in src/api/projects/projects.test.ts).
 *
 * - Spent     = paid expenses linked to the project + bought materials with a price that were not logged as
 *               an expense. A purchase that was logged as an expense counts once: as the expense.
 * - Committed = unpaid linked expenses + open materials (still to buy) with a known or estimated price.
 * - Remaining = budget − spent − committed (null without a budget).
 * - Status    = over budget when spent + committed exceeds the budget, at risk above 90 % of it, else in budget.
 */

/** Above this share of the budget (spent + committed), a project is "at risk". */
export const AT_RISK_RATIO = 0.9;

export const PROJECT_BUDGET_STATUSES = ["no_budget", "in_budget", "at_risk", "over_budget"] as const;
export type ProjectBudgetStatus = (typeof PROJECT_BUDGET_STATUSES)[number];

/** An expense linked to the project (one-off, or an instance of a linked recurring expense). */
export type BudgetExpense = { amountCents: number; paid: boolean };

/** A material (shopping item) of the project or of one of its tasks. */
export type BudgetMaterial = {
  bought: boolean;
  /** Price × quantity, or null when no price is known. */
  lineCents: number | null;
  /** The purchase was logged as an expense: the expense counts, not the item. */
  loggedAsExpense: boolean;
};

export type ProjectBudget = {
  budgetCents: number | null;
  spentCents: number;
  committedCents: number;
  /** Budget − spent − committed; negative when over. Null without a budget. */
  remainingCents: number | null;
  /** (Spent + committed) / budget; null without a budget (or a budget of 0). */
  usedRatio: number | null;
  status: ProjectBudgetStatus;
  /** How much spent + committed exceeds the budget; 0 when not over. */
  overByCents: number;
  breakdown: {
    expensesPaidCents: number;
    expensesUnpaidCents: number;
    materialsBoughtCents: number;
    materialsOpenCents: number;
  };
  /** Materials (open or bought, not logged as an expense) without a price: their cost is unknown. */
  unpricedMaterials: number;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Status from the budget and what is spent and committed. */
export function budgetStatus(budgetCents: number | null, usedCents: number): ProjectBudgetStatus {
  if (budgetCents === null) return "no_budget";
  if (usedCents > budgetCents) return "over_budget";
  if (budgetCents > 0 && usedCents / budgetCents > AT_RISK_RATIO) return "at_risk";
  return "in_budget";
}

export function computeProjectBudget(
  budgetCents: number | null,
  expenses: readonly BudgetExpense[],
  materials: readonly BudgetMaterial[],
): ProjectBudget {
  const expensesPaidCents = sum(expenses.filter((expense) => expense.paid).map((expense) => expense.amountCents));
  const expensesUnpaidCents = sum(expenses.filter((expense) => !expense.paid).map((expense) => expense.amountCents));
  // A logged purchase is already in the expenses: never count the item as well.
  const ownMaterials = materials.filter((material) => !material.loggedAsExpense);
  const priced = ownMaterials.filter((material) => material.lineCents !== null);
  const materialsBoughtCents = sum(priced.filter((material) => material.bought).map((material) => material.lineCents ?? 0));
  const materialsOpenCents = sum(priced.filter((material) => !material.bought).map((material) => material.lineCents ?? 0));

  const spentCents = expensesPaidCents + materialsBoughtCents;
  const committedCents = expensesUnpaidCents + materialsOpenCents;
  const used = spentCents + committedCents;
  const remainingCents = budgetCents === null ? null : budgetCents - used;

  return {
    budgetCents,
    spentCents,
    committedCents,
    remainingCents,
    usedRatio: budgetCents === null || budgetCents === 0 ? null : used / budgetCents,
    status: budgetStatus(budgetCents, used),
    overByCents: remainingCents !== null && remainingCents < 0 ? -remainingCents : 0,
    breakdown: { expensesPaidCents, expensesUnpaidCents, materialsBoughtCents, materialsOpenCents },
    unpricedMaterials: ownMaterials.length - priced.length,
  };
}

/**
 * Materials as the budget sees them: a material is "logged as an expense" only while it points at an expense
 * the project counts. One whose expense was unlinked from the project or deleted counts as an item again, so
 * linked money never disappears from the budget and is never counted twice.
 */
export function budgetMaterialsOf(
  materials: readonly { bought: boolean; lineCents: number | null; expenseId: string | null }[],
  countedExpenseIds: ReadonlySet<string>,
): BudgetMaterial[] {
  return materials.map((material) => ({
    bought: material.bought,
    lineCents: material.lineCents,
    loggedAsExpense: material.expenseId !== null && countedExpenseIds.has(material.expenseId),
  }));
}

/** Price per unit for what a line cost in total (an invoice line), rounded to cents. */
export const unitPriceFor = (totalCents: number, quantity: number) => Math.round(totalCents / (quantity > 0 ? quantity : 1));

export type MaterialPriceSource = "item" | "product";

/**
 * What a material costs: the item's own price (from its webshop link or typed in), else the price of its
 * product at the item's shop, else the product's lowest known price; times the quantity, rounded to cents.
 */
export function materialLine(item: {
  priceCents: number | null;
  quantity: number;
  shopId: string | null;
  productPrices: readonly { shopId: string; priceCents: number | null }[];
}): { lineCents: number | null; source: MaterialPriceSource | null } {
  const quantity = item.quantity > 0 ? item.quantity : 1;
  if (item.priceCents !== null) return { lineCents: Math.round(item.priceCents * quantity), source: "item" };
  const known = item.productPrices.filter((link): link is { shopId: string; priceCents: number } => link.priceCents !== null);
  const atShop = item.shopId ? known.find((link) => link.shopId === item.shopId) : undefined;
  const price = atShop?.priceCents ?? (known.length > 0 ? Math.min(...known.map((link) => link.priceCents)) : null);
  return price === null ? { lineCents: null, source: null } : { lineCents: Math.round(price * quantity), source: "product" };
}

/** Bar segments in percent of the budget (or of the total without one), capped so they never exceed 100 together. */
export function budgetBarSegments(budget: Pick<ProjectBudget, "budgetCents" | "spentCents" | "committedCents">): {
  spent: number;
  committed: number;
} {
  const scale = Math.max(budget.budgetCents ?? 0, budget.spentCents + budget.committedCents);
  if (scale <= 0) return { spent: 0, committed: 0 };
  const spent = (budget.spentCents / scale) * 100;
  return { spent, committed: Math.min(100 - spent, (budget.committedCents / scale) * 100) };
}
