import { useTranslation } from "react-i18next";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
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
  const { t } = useTranslation("expenses");
  const { detail, habitants, shops } = useLoaderData<typeof recurringExpenseDetailLoader>();
  return (
    <RecurringExpenseDetailScreen
      detail={detail}
      habitants={habitants}
      shops={shops}
      canManage={canManageExpenses(user.role)}
      projectField={({ defaultValue }) => <ProjectFormField defaultValue={defaultValue} />}
      attachments={<>
        <DocumentAttachments entityType="subscription" entityId={detail.recurring.id} canManage={canManageDocuments(user.role)} />
        {(detail.documentEntityIds ?? []).filter((id) => id !== detail.recurring.id).map((id) => <DocumentAttachments key={id} title={t("workspace.originalDocuments")} entityType="subscription" entityId={id} canManage={canManageDocuments(user.role)} canAttach={false} />)}
      </>}
    />
  );
}
