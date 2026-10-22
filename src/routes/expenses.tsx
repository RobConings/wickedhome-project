import { useTranslation } from "react-i18next";
import { useLoaderData, useRevalidator } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ExpensesScreen, canManageExpenses, expensesAction, expensesLoader, expensesShouldRevalidate } from "@/features/expenses";
import { MailBillSuggestions } from "@/features/integrations";
import { ProjectFormField } from "@/features/projects";
import { fetchLinkedHolds } from "@/features/tasks";
import { screenHandle } from "@/lib/screen-context";

/** The expenses, plus which payments are on hold (through their pay task); a missing answer only hides holds. */
export async function loader() {
  const [page, holds] = await Promise.all([expensesLoader(), fetchLinkedHolds("expense").catch(() => ({}))]);
  return { ...page, holds: holds as Record<string, string | null> };
}

export const action = expensesAction;
export const handle = screenHandle(({ t }) => ({ kind: "expenses", label: t("nav.expenses") }));
export const shouldRevalidate = expensesShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  const { t } = useTranslation("tasks");
  const { overview, habitants, shops, holds } = useLoaderData<typeof loader>();
  const onHoldById = Object.fromEntries(Object.entries(holds).map(([id, reason]) => [id, reason ?? t("hold.noReason")]));
  const projectField = ({ defaultValue }: { defaultValue: string | null }) => <ProjectFormField defaultValue={defaultValue} />;
  const canManage = canManageExpenses(user.role);
  const revalidator = useRevalidator();
  return (
    <ExpensesScreen
      overview={overview}
      habitants={habitants}
      shops={shops}
      canManage={canManage}
      currentHabitantId={user.habitantId}
      onHoldById={onHoldById}
      projectField={projectField}
      // Bills found in connected Gmail mailboxes (integrations); loads itself and shows nothing when empty.
      // Linking one to an existing expense may change that expense (or create a payment): reload the list.
      suggestions={
        canManage && (
          <MailBillSuggestions
            habitants={habitants}
            shops={shops}
            payees={overview.payees}
            today={overview.today}
            projectField={projectField}
            onChanged={() => void revalidator.revalidate()}
          />
        )
      }
    />
  );
}
