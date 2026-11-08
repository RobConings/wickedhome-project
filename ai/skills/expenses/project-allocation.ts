import { z } from "zod";
import { getExpenseAllocation, setExpenseAllocation } from "@/api/expenses/project-allocation.service";
import { entityRef, registerAssistantTool } from "@ai/core/kit";
import { MONEY_ROLES } from "./shared";

registerAssistantTool({ name: "expenses.project_allocation", description: "Read project and household shares of one existing expense, including total, unallocated remainder and the revision required to change it. Reading creates no payment.",
  input: z.object({ expense: entityRef("expense") }), permission: "read", confirm: "never", roles: MONEY_ROLES,
  activity: { en: "Checked expense allocation", nl: "Kostenverdeling bekeken" }, run: (ctx, input) => getExpenseAllocation(ctx.householdId, input.expense.id) });
registerAssistantTool({ name: "expenses.allocate_projects", description: "Replace the project/household allocation of the SAME expense. First read expenses_project_allocation for revision. All amounts are INTEGER EURO CENTS: €45 = 4500. Shares cannot exceed the expense. Remainder stays unallocated. Does not buy goods, change stock, create another expense or debit the account again. Confirm the amounts with the person.",
  input: z.object({ expense: entityRef("expense"), revision: z.iso.datetime(), householdCents: z.number().int().min(0), projects: z.array(z.object({ project: entityRef("project"), amountCents: z.number().int().min(1) })).max(50) }),
  permission: "sensitive", confirm: "always", roles: MONEY_ROLES,
  activity: { en: "Allocated an expense", nl: "Uitgave verdeeld" },
  run: (ctx, input) => setExpenseAllocation(ctx.householdId, input.expense.id, { revision: input.revision, householdCents: input.householdCents, projects: input.projects.map((part) => ({ projectId: part.project.id, amountCents: part.amountCents })) }) });
