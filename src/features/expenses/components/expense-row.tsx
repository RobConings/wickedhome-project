import type * as React from "react";
import { CheckIcon, PauseCircleIcon, RepeatIcon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Habitant } from "@/features/household";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Expense } from "../types/expenses";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { ExpenseStatusBadge } from "./expense-status-badge";
import { MarkExpensePaidDialog } from "./mark-expense-paid-dialog";
import { ExpenseProjectChip } from "./expense-project-chip";
import { PayerBadge } from "./payer-badge";
import { useDueLabel, useRecurrenceSummary } from "./use-expense-text";
import { useOptimisticExpense } from "./use-optimistic-expense";

type ExpenseRowProps = {
  expense: Expense;
  today: string;
  habitants: Habitant[];
  /** Show the quick "mark as paid" action. */
  canManage: boolean;
  /** Pre-selected payer in "mark as paid". */
  currentHabitantId?: string | null;
  /** Logo or icon of the shop, rendered by the caller (everyday spending). */
  leading?: React.ReactNode;
  /** "On hold" reason from a linked task, passed in by the route. */
  onHold?: string | null;
  /**
   * `card` (default): a bordered `<li>`. `plain`: just the content, for a `GeneralList` row (the list draws
   * dividers and padding). `tile`: a card for the tiles view.
   */
  variant?: "card" | "plain" | "tile";
};

/**
 * One expense in a list: what, when, how much, who pays, and a one-tap "mark as paid". Links to the
 * expense's page. While a payment is being saved the row already shows it as paid.
 */
export function ExpenseRow({
  expense,
  today,
  habitants,
  canManage,
  currentHabitantId,
  leading,
  onHold,
  variant = "card",
}: ExpenseRowProps) {
  const { t } = useTranslation("expenses");
  const dueLabel = useDueLabel();
  const recurrence = useRecurrenceSummary()(expense.rrule);
  const shown = useOptimisticExpense(expense, today);
  const tile = variant === "tile";

  const icon = leading ?? <ExpenseCategoryIcon category={expense.category} />;
  const payeeLink = (
    <Link
      to={`/expenses/${expense.id}`}
      className={cn(
        "font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50",
        tile ? "line-clamp-2" : "truncate",
      )}
    >
      {expense.payee}
    </Link>
  );
  const amount = (
    <div className={cn("flex shrink-0 gap-1", tile ? "items-center justify-between gap-2" : "flex-col items-end")}>
      {/* Amounts that need paying stand out in their status colour (docs/BRANDING.md). */}
      <span
        className={cn(
          "font-semibold tabular-nums",
          shown.status === "overdue" && "text-danger",
          shown.status === "due" && "text-soon",
        )}
      >
        {formatCurrency(expense.amountCents, currentLocale())}
      </span>
      <ExpenseStatusBadge status={shown.status} />
    </div>
  );
  // Real status, not `shown`: the dialog must stay mounted while it saves.
  const markPaid = canManage && expense.status !== "paid" && (
    <MarkExpensePaidDialog
      expense={expense}
      habitants={habitants}
      today={today}
      defaultPaidById={currentHabitantId}
      trigger={
        <Button variant="outline" size="icon" className="relative z-10 shrink-0" aria-label={t("actions.markPaid")} title={t("actions.markPaid")}>
          <CheckIcon />
        </Button>
      }
    />
  );
  const onHoldBadge = onHold && (
    <Badge variant="warning" className="mt-1 self-start font-normal">
      <PauseCircleIcon aria-hidden="true" />
      {t("row.onHold", { reason: onHold })}
    </Badge>
  );

  const details = (
    <div className={cn("flex min-w-0 items-center gap-2 text-sm text-muted-foreground", tile && "flex-wrap")}>
      <span
        className={cn(
          "shrink-0",
          shown.status === "overdue" && "font-medium text-danger",
          shown.status === "due" && "font-medium text-soon",
        )}
      >
        {shown.autoPaid ? t("row.autoPaid") : dueLabel(shown, today)}
      </span>
      {expense.description && <span className="truncate">· {expense.description}</span>}
      {recurrence && (
        <span title={recurrence} className="shrink-0">
          <RepeatIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{recurrence}</span>
        </span>
      )}
      {expense.paymentMethod === "direct_debit" && !shown.paidOn && (
        <span title={t("methods.direct_debit")} className="shrink-0">
          <ZapIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t("methods.direct_debit")}</span>
        </span>
      )}
      <ExpenseProjectChip project={expense.project} />
    </div>
  );

  if (tile) {
    return (
      <div
        className={cn(
          "relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors has-[a:hover]:bg-accent/40",
          shown.status === "overdue" && "border-destructive/40",
        )}
      >
        <div className="flex items-start gap-3">
          {icon}
          <div className="min-w-0 flex-1 pt-1">{payeeLink}</div>
          {markPaid}
        </div>
        <div className="flex flex-col gap-0.5">
          {details}
          {onHoldBadge}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <PayerBadge payer={expense} habitants={habitants} />
          {amount}
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
        variant === "card" && shown.status === "overdue" && "border-danger-border",
      )}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {payeeLink}
        {details}
        {onHoldBadge}
      </div>
      <PayerBadge payer={expense} habitants={habitants} className="hidden sm:flex" />
      {amount}
      {markPaid}
    </Root>
  );
}
