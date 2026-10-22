import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import {
  RecurringExpenseDetailScreen,
  canManageExpenses,
  expensesAction,
  recurringExpenseDetailLoader,
} from "@/features/expenses";
import { ProjectFormField } from "@/features/projects";
import { screenHandle } from "@/lib/screen-context";

export const loader = recurringExpenseDetailLoader;
export const action = expensesAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "recurring_expense", id: data.detail.recurring.id, label: data.detail.recurring.payee }));

export function Component() {
  const user = useCurrentUser();
  const { detail, habitants, shops } = useLoaderData<typeof recurringExpenseDetailLoader>();
  return (
    <RecurringExpenseDetailScreen
      detail={detail}
      habitants={habitants}
      shops={shops}
      canManage={canManageExpenses(user.role)}
      projectField={({ defaultValue }) => <ProjectFormField defaultValue={defaultValue} />}
    />
  );
}
