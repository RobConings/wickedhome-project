import { useLoaderData, useRevalidator } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ProjectContactsPanel, canManageContacts } from "@/features/contacts";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { LogExpenseDialog } from "@/features/expenses";
import { ProjectMailThreadsPanel } from "@/features/integrations";
import { ProjectDetailScreen, canManageProjects, projectAction, projectDetailLoader, unlinkExpenseMaterial } from "@/features/projects";
import { ProjectMaterialsPanel } from "@/features/shopping";
import { ProjectTasksPanel } from "@/features/tasks";
import { currentLocale } from "@/lib/i18n";
import { screenHandle } from "@/lib/screen-context";
import { formatDate } from "@/types/date-format";

export const loader = projectDetailLoader;
export const action = projectAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "project", id: data.detail.project.id, label: data.detail.project.name }));

/**
 * A project's page: the projects feature draws the budget and expenses; the tasks, materials, contacts, attachments and
 * "Log an expense" come from their own features, composed here. Changes in them reload the budget.
 */
export function Component() {
  const user = useCurrentUser();
  const { detail, places, habitants, shops } = useLoaderData<typeof projectDetailLoader>();
  const revalidator = useRevalidator();
  const canManage = canManageProjects(user.role);
  const { project } = detail;
  const firstPlaceId = project.places[0]?.id ?? null;
  const refresh = () => void revalidator.revalidate();
  const locale = currentLocale();
  // The materials list shows which invoice a material is on, and reloads when that changes.
  const invoices = Object.fromEntries(detail.expenses.map((expense) => [expense.id, `${expense.payee} · ${formatDate(expense.paidOn ?? expense.dueDate, locale)}`]));
  const materialsKey = detail.materials.map((material) => `${material.id}:${material.bought ? 1 : 0}:${material.expenseId ?? ""}:${material.lineCents ?? ""}`).join(",");

  return (
    <ProjectDetailScreen
      key={project.id}
      detail={detail}
      places={places}
      canManage={canManage}
      tasks={<ProjectTasksPanel projectId={project.id} placeId={firstPlaceId} onChanged={refresh} />}
      materials={
        <ProjectMaterialsPanel
          projectId={project.id}
          canManage={canManage}
          placeId={firstPlaceId}
          onChange={refresh}
          invoices={invoices}
          onUnlinkInvoice={(item) => unlinkExpenseMaterial(project.id, item.expenseId, item.id)}
          refreshKey={materialsKey}
        />
      }
      // One key per panel: siblings sharing `project.id` made React repeat panels on reloads (2026-10-09).
      contacts={<ProjectContactsPanel key={`contacts-${project.id}`} projectId={project.id} canManage={canManageContacts(user.role)} />}
      mail={user.role === "child" ? null : <ProjectMailThreadsPanel key={`mail-${project.id}`} projectId={project.id} />}
      attachments={
        <DocumentAttachments key={`documents-${project.id}`} entityType="project" entityId={project.id} canManage={canManageDocuments(user.role)} />
      }
      renderLogExpense={({ trigger, amountCents, payee, onSaved }) => (
        <LogExpenseDialog
          habitants={habitants}
          shops={shops}
          today={detail.today}
          trigger={trigger}
          projectId={project.id}
          defaultAmountCents={amountCents}
          defaultDescription={payee}
          // Saved by the expenses route; this page reloads after it (and links bought materials via `onSaved`).
          action="/expenses"
          onSaved={onSaved}
        />
      )}
    />
  );
}
