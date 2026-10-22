import * as React from "react";
import { ArrowLeftIcon, ExternalLinkIcon, PauseIcon, PencilIcon, PlayIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { Card, CardHeader, CardTitle } from "../components/card";
import { ConfirmDialog } from "../components/confirm-dialog";
import { DescriptionItem, DescriptionList } from "../components/description-list";
import { FormField } from "../components/form-field";
import { PageHeader } from "../components/page-header";
import { HabitantAvatar, type Habitant } from "@/features/household";
import type { Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { ExpenseCategoryIcon } from "../components/expense-category-icon";
import { ExpenseFormDialog, type ExpenseProjectField } from "../components/expense-form-dialog";
import { ExpenseProjectChip } from "../components/expense-project-chip";
import { RecurringStatusBadge } from "../components/expense-status-badge";
import { CopyableValue, PaymentQrCard } from "../components/payment-qr-card";
import { TotalOpenProgressBar } from "../components/total-open-progress";
import { useRecurrenceSummary } from "../components/use-expense-text";
import type { ExpenseActionResult } from "../data/expenses-loaders";
import type { RecurringExpenseDetail, RecurringStatus } from "../types/expenses";
import { formatIban, formatStructuredCommunication } from "../types/payment-references";
import { HistoryList } from "./expense-detail-screen";

type RecurringExpenseDetailScreenProps = {
  detail: RecurringExpenseDetail;
  habitants: Habitant[];
  shops?: Shop[];
  canManage: boolean;
  /** Optional "Project" field in the edit form, composed by the route. */
  projectField?: ExpenseProjectField;
};

/** One recurring expense: rhythm, cost per month/year, status (pause, resume, end), upcoming and history. */
export function RecurringExpenseDetailScreen({ detail, habitants, shops = [], canManage, projectField }: RecurringExpenseDetailScreenProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const fetcher = useFetcher<ExpenseActionResult>();
  const recurrenceSummary = useRecurrenceSummary();
  const { recurring, upcoming, history, today } = detail;
  const [endDate, setEndDate] = React.useState(today);
  const busy = fetcher.state !== "idle";
  const pendingStatus = fetcher.formData?.get("status");
  const status = (typeof pendingStatus === "string" ? pendingStatus : recurring.status) as RecurringStatus;
  const habitant = (id: string | null) => habitants.find((candidate) => candidate.id === id);
  const none = <span className="text-muted-foreground">{t("detail.none")}</span>;

  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  const setStatus = (next: RecurringStatus, extra: Record<string, string> = {}) =>
    fetcher
      .submit({ intent: "recurring-status", id: recurring.id, status: next, ...extra }, { method: "post" })
      .then(() => toast.success(next === "paused" ? t("end.paused") : next === "ended" ? t("end.done") : t("end.resumed")));

  const actions = canManage && (
    <>
      <ExpenseFormDialog
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
      {status === "active" && (
        <Button variant="outline" disabled={busy} onClick={() => void setStatus("paused")}>
          <PauseIcon />
          {t("actions.pause")}
        </Button>
      )}
      {status !== "active" && (
        <Button variant="outline" disabled={busy} onClick={() => void setStatus("active")}>
          <PlayIcon />
          {t("actions.resume")}
        </Button>
      )}
      {status !== "ended" && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={busy}>
              <SquareIcon />
              {t("actions.end")}
            </Button>
          }
          title={t("end.title", { payee: recurring.payee })}
          description={
            <span className="flex flex-col gap-3">
              <span>{t("end.description")}</span>
              <FormField label={t("fields.endDate")} htmlFor="recurring-end-date">
                <Input id="recurring-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value || today)} />
              </FormField>
            </span>
          }
          confirmLabel={t("actions.end")}
          cancelLabel={tCommon("actions.cancel")}
          onConfirm={() => setStatus("ended", { endDate })}
        />
      )}
      <ConfirmDialog
        trigger={
          <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}>
            <Trash2Icon />
            {t("actions.deleteRecurring")}
          </Button>
        }
        title={t("delete.recurringTitle", { payee: recurring.payee })}
        description={t("delete.recurringDescription")}
        confirmLabel={tCommon("actions.delete")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        onConfirm={() =>
          fetcher.submit({ intent: "delete-recurring", id: recurring.id, redirectTo: "/expenses?view=recurring" }, { method: "post" })
        }
      />
    </>
  );

  const payerPerson = habitant(recurring.payerHabitantId);

  return (
    <PageContainer>
      <Button asChild variant="ghost" size="sm" className="-mb-4 self-start">
        <Link to="/expenses?view=recurring">
          <ArrowLeftIcon />
          {t("detail.back")}
        </Link>
      </Button>

      <PageHeader
        eyebrow={t(`kinds.${recurring.kind}`)}
        title={recurring.payee}
        description={
          recurring.project ? (
            <span className="flex flex-wrap items-center gap-2">
              {recurring.description}
              <ExpenseProjectChip project={recurring.project} />
            </span>
          ) : (
            (recurring.description ?? undefined)
          )
        }
        actions={actions}
      />

      <PageGrid columns="main-sidebar">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="items-center">
              <div className="flex items-center gap-3">
                <ExpenseCategoryIcon category={recurring.category} />
                <div className="flex flex-col">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
                    {formatCurrency(recurring.amountCents, locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">{recurrenceSummary(recurring.rrule)}</span>
                </div>
              </div>
              <RecurringStatusBadge status={status} />
            </CardHeader>
            {recurring.totalOpen && (
              <section aria-label={t("totalOpen.label")} className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">{t("totalOpen.label")}</h3>
                <TotalOpenProgressBar progress={recurring.totalOpen} variant="full" />
              </section>
            )}
            <DescriptionList>
              <DescriptionItem label={t("fields.nextDue")}>
                {status === "active" && recurring.nextDueDate ? formatDate(recurring.nextDueDate, locale) : t("detail.ended")}
              </DescriptionItem>
              <DescriptionItem label={t("totals.perMonth")}>
                {formatCurrency(recurring.monthlyCents, locale)} · {t("row.perYear", { amount: formatCurrency(recurring.yearlyCents, locale) })}
              </DescriptionItem>
              <DescriptionItem label={t("fields.paymentMethod")}>
                {recurring.paymentMethod ? t(`methods.${recurring.paymentMethod}`) : none}
              </DescriptionItem>
              <DescriptionItem label={t("payer.label")}>
                {recurring.payerType === "joint" ? (
                  t("payer.joint")
                ) : recurring.payerType === "person" ? (
                  <span className="inline-flex items-center gap-2">
                    {payerPerson && <HabitantAvatar habitant={payerPerson} size="sm" />}
                    {payerPerson?.name ?? t("detail.unknownHabitant")}
                  </span>
                ) : (
                  recurring.shares
                    .map((share) => `${habitant(share.habitantId)?.name ?? "?"} ${formatCurrency(share.amountCents, locale)}`)
                    .join(" · ")
                )}
              </DescriptionItem>
              <DescriptionItem label={t("fields.category")}>{t(`categories.${recurring.category}`)}</DescriptionItem>
              {recurring.iban && (
                <DescriptionItem label={t("fields.iban")}>
                  <CopyableValue value={recurring.iban} display={formatIban(recurring.iban)} />
                </DescriptionItem>
              )}
              {(recurring.structuredCommunication || recurring.reference) && (
                <DescriptionItem label={t("fields.communication")}>
                  {recurring.structuredCommunication
                    ? formatStructuredCommunication(recurring.structuredCommunication)
                    : recurring.reference}
                </DescriptionItem>
              )}
              {recurring.trialEndsOn && (
                <DescriptionItem label={t("fields.trialEndsOn")}>{formatDate(recurring.trialEndsOn, locale)}</DescriptionItem>
              )}
              {recurring.remindDaysBefore !== null && recurring.reminderOn && (
                <DescriptionItem label={t("row.reminder")}>
                  {t("detail.reminderOn", { count: recurring.remindDaysBefore, date: formatDate(recurring.reminderOn, locale) })}
                </DescriptionItem>
              )}
              {recurring.candidateToCancel && (
                <DescriptionItem label={t("fields.candidateToCancel")}>{t("row.candidate")}</DescriptionItem>
              )}
              {recurring.endDate && (
                <DescriptionItem label={t("fields.endDate")}>{formatDate(recurring.endDate, locale)}</DescriptionItem>
              )}
              {recurring.websiteUrl && (
                <DescriptionItem label={t("fields.website")}>
                  <a
                    href={recurring.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    {new URL(recurring.websiteUrl).hostname}
                    <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                  </a>
                </DescriptionItem>
              )}
              {recurring.notes && (
                <DescriptionItem label={t("fields.notes")} wide>
                  <span className="font-normal whitespace-pre-line">{recurring.notes}</span>
                </DescriptionItem>
              )}
            </DescriptionList>
          </Card>

          <Card>
            <CardTitle>{t("detail.upcoming")}</CardTitle>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noUpcoming")}</p>
            ) : (
              <HistoryList items={upcoming} habitants={habitants} />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {recurring.paymentMethod === "wire_transfer" && upcoming[0] && <PaymentQrCard expense={upcoming[0]} />}
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
