import * as React from "react";
import { CheckIcon, PauseCircleIcon, PencilIcon, RepeatIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/card";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { ShopLogo, type Shop } from "@/features/shops";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { ExpenseCategoryIcon } from "../components/expense-category-icon";
import { ExpenseFormDialog, type ExpenseProjectField } from "../components/expense-form-dialog";
import { ExpenseProjectChip } from "../components/expense-project-chip";
import { ExpenseStatusBadge } from "../components/expense-status-badge";
import { MarkExpensePaidDialog } from "../components/mark-expense-paid-dialog";
import { CopyableValue, PaymentQrCard } from "../components/payment-qr-card";
import { useDueLabel, useRecurrenceSummary } from "../components/use-expense-text";
import { useOptimisticExpense } from "../components/use-optimistic-expense";
import type { ExpenseActionResult } from "../data/expenses-loaders";
import type { ExpenseDetail } from "../types/expenses";
import { formatIban, formatStructuredCommunication } from "../types/payment-references";
import { BackButton } from "@/components/shared/link-buttons";

type ExpenseDetailScreenProps = {
  detail: ExpenseDetail;
  habitants: Habitant[];
  shops?: Shop[];
  canManage: boolean;
  currentHabitantId?: string | null;
  /** The expense's documents (invoice, payment proof), rendered by the route (`DocumentAttachments`). */
  attachments?: React.ReactNode;
  /** A linked "Pay …" task (status, blockers, comments), composed in by the route. */
  linkedTask?: React.ReactNode;
  /** "On hold" reason from the linked pay task, passed in by the route. */
  onHold?: string | null;
  /** Optional "Project" field in the edit form, composed by the route. */
  projectField?: ExpenseProjectField;
};

/** One expense: amount and status, payment details with QR, who pays, history, documents. */
export function ExpenseDetailScreen({
  detail,
  habitants,
  shops = [],
  canManage,
  currentHabitantId,
  attachments,
  linkedTask,
  onHold,
  projectField,
}: ExpenseDetailScreenProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const fetcher = useFetcher<ExpenseActionResult>();
  const dueLabel = useDueLabel();
  const recurrenceSummary = useRecurrenceSummary();
  const { expense, recurring, history, today } = detail;
  const shown = useOptimisticExpense(expense, today);
  const habitant = (id: string | null) => habitants.find((candidate) => candidate.id === id);
  const paidBy = habitant(shown.paidById);
  const shop = shops.find((candidate) => candidate.id === expense.shopId);
  const busy = fetcher.state !== "idle";
  const showQr =
    !shown.paidOn && expense.paymentMethod !== "direct_debit" && expense.paymentMethod !== "card" && expense.paymentMethod !== "cash";

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.formError) toast.error(fetcher.data.formError);
    else if (fetcher.data.ok && fetcher.data.intent === "unpay") toast.success(t("pay.undone"));
  }, [fetcher.state, fetcher.data, t]);

  /** Resolves once the action and the reload (or the redirect) are done, for `ConfirmDialog`. */
  const submit = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit({ intent, id: expense.id, ...extra }, { method: "post" });

  const actions = canManage && (
    <>
      {expense.status === "paid" && shown.status === "paid" ? (
        <Button variant="outline" disabled={busy} onClick={() => void submit("unpay")}>
          <RotateCcwIcon />
          {expense.autoPaid ? t("actions.undoAutoPay") : t("actions.markUnpaid")}
        </Button>
      ) : (
        <MarkExpensePaidDialog
          expense={expense}
          habitants={habitants}
          today={today}
          defaultPaidById={currentHabitantId}
          trigger={
            <Button disabled={busy}>
              <CheckIcon />
              {t("actions.markPaid")}
            </Button>
          }
        />
      )}
      <ExpenseFormDialog
        expense={expense}
        recurring={recurring}
        habitants={habitants}
        shops={shops}
        today={today}
        projectField={projectField}
        trigger={
          <Button variant="outline">
            <PencilIcon />
            {tCommon("actions.edit")}
          </Button>
        }
      />
      <DeleteConfirmDialog
        trigger={
          <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}>
            <Trash2Icon />
            {tCommon("actions.delete")}
          </Button>
        }
        title={t("delete.title", { payee: expense.payee })}
        description={recurring ? t("delete.inRecurringDescription") : t("delete.description")}
        onConfirm={() => submit("delete", { redirectTo: "/expenses" })}
      />
    </>
  );

  const paymentText = shown.paidOn
    ? shown.autoPaid
      ? t("detail.autoPaidOn", { date: formatDate(shown.paidOn, locale) })
      : paidBy
        ? t("detail.paidOnBy", { date: formatDate(shown.paidOn, locale), name: paidBy.name })
        : t("detail.paidOn", { date: formatDate(shown.paidOn, locale) })
    : t("detail.notPaid");
  const none = <span className="text-muted-foreground">{t("detail.none")}</span>;
  const payerPerson = habitant(expense.payerHabitantId);

  return (
    <PageContainer>
      <BackButton to="/expenses" className="-mb-4 self-start">{t("detail.back")}</BackButton>

      <PageHeader
        eyebrow={recurring ? t(`kinds.${recurring.kind}`) : t(`categories.${expense.category}`)}
        title={expense.payee}
        description={
          expense.project ? (
            <span className="flex flex-wrap items-center gap-2">
              {expense.description}
              <ExpenseProjectChip project={expense.project} />
            </span>
          ) : (
            (expense.description ?? undefined)
          )
        }
        actions={actions}
      />

      <PageGrid columns="main-sidebar">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="items-center">
              <div className="flex items-center gap-3">
                {shop ? <ShopLogo shop={shop} size="md" /> : <ExpenseCategoryIcon category={expense.category} />}
                <div className="flex flex-col">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
                    {formatCurrency(expense.amountCents, locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">{dueLabel(shown, today)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ExpenseStatusBadge status={shown.status} />
                {onHold && (
                  <Badge variant="outline" className="border-warning/40 bg-warning/10 font-normal text-warning">
                    <PauseCircleIcon aria-hidden="true" />
                    {t("row.onHold", { reason: onHold })}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <DescriptionList>
              <DescriptionItem label={t("fields.dueDate")}>{formatDate(expense.dueDate, locale)}</DescriptionItem>
              <DescriptionItem label={t("detail.payment")}>{paymentText}</DescriptionItem>
              <DescriptionItem label={t("fields.paymentMethod")}>
                {expense.paymentMethod ? t(`methods.${expense.paymentMethod}`) : none}
              </DescriptionItem>
              <DescriptionItem label={t("payer.label")}>
                {expense.payerType === "joint"
                  ? t("payer.joint")
                  : expense.payerType === "person"
                    ? (payerPerson?.name ?? t("detail.unknownHabitant"))
                    : t("payer.split")}
              </DescriptionItem>
              {shop && <DescriptionItem label={t("fields.shop")}>{shop.name}</DescriptionItem>}
              <DescriptionItem label={t("fields.category")}>{t(`categories.${expense.category}`)}</DescriptionItem>
              {(expense.iban || expense.structuredCommunication || expense.reference) && (
                <>
                  <DescriptionItem label={t("fields.iban")}>
                    {expense.iban ? <CopyableValue value={expense.iban} display={formatIban(expense.iban)} /> : none}
                  </DescriptionItem>
                  <DescriptionItem label={t("fields.communication")}>
                    {expense.structuredCommunication ? (
                      <CopyableValue
                        value={formatStructuredCommunication(expense.structuredCommunication)}
                        display={formatStructuredCommunication(expense.structuredCommunication)}
                      />
                    ) : expense.reference ? (
                      <CopyableValue value={expense.reference} display={expense.reference} mono={false} />
                    ) : (
                      none
                    )}
                  </DescriptionItem>
                </>
              )}
              {expense.notes && (
                <DescriptionItem label={t("fields.notes")} wide>
                  <span className="font-normal whitespace-pre-line">{expense.notes}</span>
                </DescriptionItem>
              )}
            </DescriptionList>
          </Card>

          {expense.payerType === "split" && expense.shares.length > 0 && (
            <Card>
              <CardTitle>{t("payer.split")}</CardTitle>
              <ul className="flex flex-col gap-3">
                {expense.shares.map((share) => {
                  const person = habitant(share.habitantId);
                  return (
                    <li key={share.habitantId} className="flex items-center gap-3">
                      {person && <HabitantAvatar habitant={person} size="sm" />}
                      <span className="flex-1 text-sm">{person?.name ?? t("detail.unknownHabitant")}</span>
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(share.amountCents, locale)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {linkedTask}
          {attachments}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {showQr && <PaymentQrCard expense={expense} />}

          {recurring && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RepeatIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t("detail.recurring")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">{recurrenceSummary(recurring.rrule)}</p>
                <p className="text-muted-foreground">
                  {recurring.nextDueDate
                    ? t("detail.nextDue", { date: formatDate(recurring.nextDueDate, locale) })
                    : t("detail.ended")}
                </p>
                <p className="text-muted-foreground">
                  {t("detail.amountEach", { amount: formatCurrency(recurring.amountCents, locale) })}
                </p>
              </CardContent>
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link to={`/expenses/recurring/${recurring.id}`}>{t("actions.openRecurring")}</Link>
              </Button>
            </Card>
          )}

          <Card>
            <CardTitle>{t("detail.history")}</CardTitle>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noHistory")}</p>
            ) : (
              <HistoryList items={history} habitants={habitants} />
            )}
          </Card>
        </div>
      </PageGrid>
    </PageContainer>
  );
}

/** Earlier expenses of the same recurring expense or payee: date, who paid, amount and status. */
export function HistoryList({ items, habitants }: { items: ExpenseDetail["history"]; habitants: Habitant[] }) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  return (
    <ul className="flex flex-col divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            to={`/expenses/${item.id}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-md py-2 text-sm hover:text-primary"
          >
            <span className="flex flex-col">
              <span>{formatDate(item.dueDate, locale)}</span>
              <span className="text-xs text-muted-foreground">
                {item.autoPaid
                  ? t("row.autoPaid")
                  : item.paidOn
                    ? (habitants.find((habitant) => habitant.id === item.paidById)?.name ?? t(`status.${item.status}`))
                    : t(`status.${item.status}`)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatCurrency(item.amountCents, locale)}</span>
              <ExpenseStatusBadge status={item.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
