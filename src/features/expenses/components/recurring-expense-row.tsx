import * as React from "react";
import { BellIcon, FlaskConicalIcon, PauseIcon, PlayIcon, ScissorsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Habitant } from "@/features/household";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ExpenseActionResult } from "../data/expenses-loaders";
import type { RecurringExpense, RecurringStatus } from "../types/expenses";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { RecurringStatusBadge } from "./expense-status-badge";
import { ExpenseProjectChip } from "./expense-project-chip";
import { PayerBadge } from "./payer-badge";
import { TotalOpenProgressBar } from "./total-open-progress";
import { useRecurrenceSummary } from "./use-expense-text";
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";
import { dateText } from "@/lib/locale-text";
import { useCanManage } from "@/lib/permissions";

type RecurringExpenseRowProps = {
  recurring: RecurringExpense;
  today: string;
  habitants: Habitant[];
  /** Show the quick pause / resume. */
  /** Defaults to the nearest `CanManageProvider`. */
  canManage?: boolean;
  /**
   * `card` (default): a bordered `<li>`. `plain`: just the content, for a `GeneralList` row (the list draws
   * dividers and padding). `tile`: a card for the tiles view.
   */
  variant?: "card" | "plain" | "tile";
};

/**
 * One recurring expense: kind, rhythm and amount, next date, flags (trial, to cancel, reminder), the
 * monthly and yearly equivalent, and a quick pause / resume (optimistic).
 */
export function RecurringExpenseRow({ recurring, today, habitants, canManage: canManageProp, variant = "card" }: RecurringExpenseRowProps) {
  const canManage = useCanManage(canManageProp);
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const recurrence = useRecurrenceSummary()(recurring.rrule);
  const fetcher = useFetcher<ExpenseActionResult>({ key: `recurring-status-${recurring.id}` });
  const pendingStatus = fetcher.formData?.get("status");
  const status = (typeof pendingStatus === "string" ? pendingStatus : recurring.status) as RecurringStatus;
  useFetcherErrorToast(fetcher);
  const remindNow = recurring.reminderOn !== null && recurring.reminderOn <= today;
  const inactive = status !== "active";

  const next =
    status === "paused"
      ? t("row.paused")
      : status === "ended"
        ? recurring.endDate
          ? t("row.endedOn", { date: dateText(recurring.endDate) })
          : t("recurringStatus.ended")
        : recurring.nextDueDate
          ? t("row.nextOn", { date: dateText(recurring.nextDueDate) })
          : t("detail.ended");

  const tile = variant === "tile";
  const payeeLink = (
    <Link
      to={`/expenses/recurring/${recurring.id}`}
      className={cn(
        "font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50",
        tile ? "line-clamp-2" : "truncate",
      )}
    >
      {recurring.payee}
    </Link>
  );
  const flags = (
    <>
      <Badge variant="secondary" className="font-normal">
        {t(`kinds.${recurring.kind}`)}
      </Badge>
      {recurring.inTrial && recurring.trialEndsOn && (
        <Badge variant="info" className="font-normal">
          <FlaskConicalIcon aria-hidden="true" />
          {t("row.trialUntil", { date: dateText(recurring.trialEndsOn) })}
        </Badge>
      )}
      {recurring.candidateToCancel && status !== "ended" && (
        <Badge variant="highlight" className="font-normal">
          <ScissorsIcon aria-hidden="true" />
          {t("row.candidate")}
        </Badge>
      )}
    </>
  );
  const details = (
    <>
      <div className={cn("flex min-w-0 items-center gap-2 text-sm text-muted-foreground", tile && "flex-wrap")}>
        <span className="shrink-0 tabular-nums">{formatCurrency(recurring.amountCents, locale)}</span>
        {recurrence && <span className="truncate">· {recurrence}</span>}
        <ExpenseProjectChip project={recurring.project} />
      </div>
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", remindNow && !inactive && "font-medium text-warning")}>
        <span>{next}</span>
        {remindNow && !inactive && <BellIcon className="size-3.5" aria-label={t("row.reminder")} role="img" />}
      </div>
      {recurring.totalOpen && <TotalOpenProgressBar progress={recurring.totalOpen} className="mt-1 max-w-sm" />}
    </>
  );
  const amounts = (
    <div className={cn("flex shrink-0 gap-1", tile ? "items-center justify-between gap-2" : "flex-col items-end")}>
      <span className={cn("font-semibold tabular-nums", inactive && "text-muted-foreground line-through")}>
        {t("row.perMonth", { amount: formatCurrency(recurring.monthlyCents, locale) })}
      </span>
      {inactive ? (
        <RecurringStatusBadge status={status} />
      ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("row.perYear", { amount: formatCurrency(recurring.yearlyCents, locale) })}
        </span>
      )}
    </div>
  );
  const pauseButton = canManage && status !== "ended" && (
    <Button
      variant="outline"
      size="icon"
      className="relative z-10 shrink-0"
      aria-label={status === "paused" ? t("actions.resume") : t("actions.pause")}
      title={status === "paused" ? t("actions.resume") : t("actions.pause")}
      disabled={fetcher.state !== "idle"}
      onClick={() =>
        void fetcher.submit(
          { intent: "recurring-status", id: recurring.id, status: status === "paused" ? "active" : "paused" },
          { method: "post" },
        )
      }
    >
      {status === "paused" ? <PlayIcon /> : <PauseIcon />}
    </Button>
  );

  if (tile) {
    return (
      <div
        className={cn(
          "relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors has-[a:hover]:bg-accent/40",
          status === "ended" && "opacity-70",
        )}
      >
        <div className="flex items-start gap-3">
          <ExpenseCategoryIcon category={recurring.category} />
          <div className="min-w-0 flex-1 pt-1">{payeeLink}</div>
          {pauseButton}
        </div>
        <div className="flex flex-wrap items-center gap-1">{flags}</div>
        <div className="flex flex-col gap-1">{details}</div>
        <div className="mt-auto flex flex-col gap-2">
          <PayerBadge payer={recurring} habitants={habitants} />
          {amounts}
        </div>
      </div>
    );
  }

  const Root = variant === "card" ? "li" : "div";
  return (
    <Root
      className={cn(
        "relative flex items-center gap-3 transition-colors",
        variant === "card" && "rounded-xl border bg-card px-4 py-3 shadow-xs has-[a:hover]:bg-accent/40",
        status === "ended" && "opacity-70",
      )}
    >
      <ExpenseCategoryIcon category={recurring.category} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {payeeLink}
          {flags}
        </div>
        {details}
      </div>
      <PayerBadge payer={recurring} habitants={habitants} className="hidden sm:flex" />
      {amounts}
      {pauseButton}
    </Root>
  );
}
