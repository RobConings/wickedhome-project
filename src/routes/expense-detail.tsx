import { useTranslation } from "react-i18next";
import { useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { ExpenseDetailScreen, canManageExpenses, expenseDetailLoader, expensesAction } from "@/features/expenses";
import { useMailFileNote } from "@/features/integrations";
import { ProjectFormField } from "@/features/projects";
import { LinkedTaskPanel, fetchLinkedHolds } from "@/features/tasks";
import { screenHandle } from "./lib/screen-context";

/** The expense, plus whether its pay task is on hold (a missing answer only hides the hold). */
export async function loader(args: LoaderFunctionArgs) {
  const [page, holds] = await Promise.all([expenseDetailLoader(args), fetchLinkedHolds("expense").catch(() => ({}))]);
  return { ...page, holds: holds as Record<string, string | null> };
}

export const action = expensesAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "expense", id: data.detail.expense.id, label: data.detail.expense.payee }));

export function Component() {
  const user = useCurrentUser();
  const { t } = useTranslation("tasks");
  const revalidator = useRevalidator();
  const { detail, habitants, shops, holds } = useLoaderData<typeof loader>();
  const expenseId = detail.expense.id;
  const onHold = expenseId in holds ? (holds[expenseId] ?? t("hold.noReason")) : null;
  const mailFileNote = useMailFileNote(expenseId);
  return (
    <ExpenseDetailScreen
      detail={detail}
      habitants={habitants}
      shops={shops}
      canManage={canManageExpenses(user.role)}
      currentHabitantId={user.habitantId}
      onHold={onHold}
      projectField={({ defaultValue }) => <ProjectFormField defaultValue={defaultValue} />}
      linkedTask={
        // The pay task follows the expense (and the other way round): its status, who pays, on hold,
        // what it waits for, and the payment's comment thread. Changing it reloads the expense.
        // Keys unique among the screen's panels: two siblings with the same key made React repeat the panel
        // on every reload (2026-10-09).
        <LinkedTaskPanel
          key={`task-${expenseId}`}
          originType="expense"
          originId={expenseId}
          title={t("linked.payTitle")}
          emptyText={detail.expense.paymentMethod === "direct_debit" ? t("linked.directDebit") : t("linked.noPayTask")}
          onChanged={() => void revalidator.revalidate()}
        />
      }
      attachments={
        // Expenses keep the documents entity type "bill" (existing attachments). Keyed: moving to another
        // expense in the history starts a fresh list.
        <DocumentAttachments
          key={`documents-${expenseId}`}
          entityType="bill"
          entityId={expenseId}
          canManage={canManageDocuments(user.role)}
          // "From mail on …" for PDFs that came from a mail bill (integrations).
          fileNote={mailFileNote}
        />
      }
    />
  );
}
