import * as React from "react";
import { LinkIcon, PackageCheckIcon, PlusIcon, ReceiptIcon, RepeatIcon, UnlinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectActionResult } from "../data/projects-loaders";
import type { ProjectExpense, ProjectMaterial, ProjectRecurringExpense } from "../types/projects";
import { LinkInvoiceMaterialsDialog } from "./link-invoice-materials-dialog";
import { LinkToProjectDialog } from "./link-to-project-dialog";
import { useProjectText } from "./use-project-text";

/** What the route needs to open the expenses feature's "Log an expense" for this project. */
export type LogExpenseRenderOptions = {
  trigger: React.ReactElement;
  /** Pre-filled amount, e.g. the bought materials not logged yet. */
  amountCents?: number;
  payee?: string;
  /** After saving, with the new expense's id. */
  onSaved?: (expenseId: string) => void;
};
export type RenderLogExpense = (options: LogExpenseRenderOptions) => React.ReactNode;

type ProjectExpensesSectionProps = {
  projectId: string;
  today: string;
  expenses: ProjectExpense[];
  recurring: ProjectRecurringExpense[];
  canManage: boolean;
  /** "Log an expense" (paid, prefilled with the project), composed by the route from the expenses feature. */
  renderLogExpense?: RenderLogExpense;
  /** The project's materials, for "Link materials" (which are on an invoice). */
  materials?: ProjectMaterial[];
  /** "Read invoice with AI" is offered there. */
  invoiceReader?: boolean;
};

/** The project's expenses: unpaid soonest first, then paid; its recurring expenses; link more or log one. */
export function ProjectExpensesSection({
  projectId,
  today,
  expenses,
  recurring,
  canManage,
  renderLogExpense,
  materials = [],
  invoiceReader = false,
}: ProjectExpensesSectionProps) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const fetcher = useFetcher<ProjectActionResult>();
  // "Link materials" for this expense; `offerFor`: just added, opens once the page has it.
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [offerFor, setOfferFor] = React.useState<string | null>(null);
  const linking = linkingId ? expenses.find((expense) => expense.id === linkingId) : undefined;
  const hasFreeMaterials = materials.some((material) => material.expenseId === null);
  const onInvoice = (expenseId: string) => materials.filter((material) => material.expenseId === expenseId).length;
  const offer = (expenseId: string) => {
    if (hasFreeMaterials) setOfferFor(expenseId);
  };

  // The page reloaded with the new expense: open the dialog for it (adjusting state while rendering, once).
  if (offerFor && expenses.some((expense) => expense.id === offerFor)) {
    setLinkingId(offerFor);
    setOfferFor(null);
  }

  const unlinking = fetcher.state !== "idle" ? String(fetcher.formData?.get("itemId") ?? "") : null;
  const unlink = (kind: "expense" | "recurring", itemId: string) =>
    void fetcher.submit({ intent: "unlink", id: projectId, kind, itemId }, { method: "post" });

  return (
    <div className="flex flex-col gap-3">
      {expenses.length === 0 && recurring.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          <ReceiptIcon className="size-4 shrink-0" aria-hidden="true" />
          {t("expenses.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {recurring.map((item) => (
            <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2.5", unlinking === item.id && "opacity-50")}>
              <RepeatIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Link to={`/expenses/recurring/${encodeURIComponent(item.id)}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {item.payee}
              </Link>
              <span className="text-sm text-muted-foreground tabular-nums">{t("expenses.perOccurrence", { amount: text.money(item.amountCents) })}</span>
              {canManage && (
                <Button variant="ghost" size="icon-sm" aria-label={t("expenses.unlink", { name: item.payee })} title={t("expenses.unlinkShort")} onClick={() => unlink("recurring", item.id)}>
                  <UnlinkIcon />
                </Button>
              )}
            </li>
          ))}
          {expenses.map((expense) => {
            const overdue = !expense.paidOn && expense.dueDate < today;
            return (
              <li key={expense.id} className={cn("flex items-center gap-3 px-3 py-2.5", unlinking === expense.id && "opacity-50")}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link to={`/expenses/${encodeURIComponent(expense.id)}`} className="truncate font-medium hover:underline">
                    {expense.payee}
                  </Link>
                  <span className={cn("text-xs text-muted-foreground", overdue && "text-destructive")}>
                    {expense.paidOn ? t("expenses.paidOn", { date: text.date(expense.paidOn) }) : t("expenses.dueOn", { date: text.date(expense.dueDate) })}
                    {onInvoice(expense.id) > 0 && <> · {t("invoice.count", { count: onInvoice(expense.id) })}</>}
                  </span>
                </div>
                {!expense.paidOn && (
                  <Badge variant="outline" className={cn(overdue && "border-destructive/50 text-destructive")}>
                    {t("expenses.unpaid")}
                  </Badge>
                )}
                <span className={cn("text-sm font-medium tabular-nums", !expense.paidOn && "text-muted-foreground")}>{text.money(expense.amountCents)}</span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("invoice.linkFor", { name: expense.payee })}
                    title={t("invoice.link")}
                    onClick={() => setLinkingId(expense.id)}
                  >
                    <PackageCheckIcon />
                  </Button>
                )}
                {canManage && !expense.recurringExpenseId && (
                  <Button variant="ghost" size="icon-sm" aria-label={t("expenses.unlink", { name: expense.payee })} title={t("expenses.unlinkShort")} onClick={() => unlink("expense", expense.id)}>
                    <UnlinkIcon />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {renderLogExpense?.({
            onSaved: offer,
            trigger: (
              <Button variant="outline" size="sm">
                <PlusIcon />
                {t("expenses.log")}
              </Button>
            ),
          })}
          <LinkToProjectDialog
            projectId={projectId}
            kind="expense"
            onLinked={offer}
            trigger={
              <Button variant="outline" size="sm">
                <LinkIcon />
                {t("expenses.linkExisting")}
              </Button>
            }
          />
          <LinkToProjectDialog
            projectId={projectId}
            kind="recurring"
            trigger={
              <Button variant="ghost" size="sm">
                <RepeatIcon />
                {t("expenses.linkRecurring")}
              </Button>
            }
          />
        </div>
      )}

      {canManage && linking && (
        <LinkInvoiceMaterialsDialog
          key={linking.id}
          projectId={projectId}
          expense={linking}
          materials={materials}
          invoiceReader={invoiceReader}
          open
          onOpenChange={(next) => !next && setLinkingId(null)}
        />
      )}
    </div>
  );
}
