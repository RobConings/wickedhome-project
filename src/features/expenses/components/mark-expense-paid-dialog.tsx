import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Stack } from "./stack";
import { FormField } from "./form-field";
import { InlineAlert } from "./inline-alert";
import { HabitantPicker, type Habitant } from "@/features/household";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { useSelections } from "@/lib/selections";
import { formatDate } from "@/types/date-format";
import type { ExpenseActionResult } from "../data/expenses-loaders";
import type { Expense } from "../types/expenses";

type MarkExpensePaidDialogProps = {
  expense: Pick<Expense, "id" | "payee" | "amountCents" | "dueDate">;
  habitants: Habitant[];
  /** "Today" in the household time zone: the default payment date. */
  today: string;
  /** Pre-selected payer, usually the logged-in user's habitant. */
  defaultPaidById?: string | null;
  trigger: React.ReactElement;
};

/**
 * Quick "mark as paid": date and payer are pre-filled, so it's usually one click on Save. While it saves
 * the fields are locked; the expense's row and badge already show it as paid (`useOptimisticExpense`).
 */
export function MarkExpensePaidDialog({ expense, habitants, today, defaultPaidById, trigger }: MarkExpensePaidDialogProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  const fetcher = useFetcher<ExpenseActionResult>({ key: `expense-pay-${expense.id}-${session}` });
  const { recordUse } = useSelections("habitant");
  const [paidById, setPaidById] = React.useState<string | null>(defaultPaidById ?? null);

  const submitting = fetcher.state !== "idle";
  const result = fetcher.data;
  const saved = fetcher.state === "idle" && result?.ok === true;
  // Confirm as soon as the action succeeded: once the reload lands this dialog is usually unmounted.
  const succeeded = fetcher.state !== "submitting" && result?.ok === true;

  React.useEffect(() => {
    if (!succeeded) return;
    toast.success(t("pay.done"));
    if (paidById) void recordUse(paidById);
  }, [succeeded, t, paidById, recordUse]);

  function handleOpenChange(next: boolean) {
    if (submitting && !next) return;
    if (next) setSession((value) => value + 1);
    setOpen(next);
  }

  return (
    <Dialog open={open && !saved} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <fetcher.Form method="post" noValidate>
          <input type="hidden" name="intent" value="pay" />
          <input type="hidden" name="id" value={expense.id} />
          <fieldset disabled={submitting} className="contents">
            <Stack gap="lg">
              <DialogHeader>
                <DialogTitle>{t("pay.title", { payee: expense.payee })}</DialogTitle>
                <DialogDescription>
                  {t("pay.description", {
                    amount: formatCurrency(expense.amountCents, locale),
                    date: formatDate(expense.dueDate, locale),
                  })}
                </DialogDescription>
              </DialogHeader>

              {result?.formError && <InlineAlert tone="error">{result.formError}</InlineAlert>}

              <FormField label={t("fields.paidOn")} htmlFor={`expense-paid-on-${expense.id}`} errors={result?.errors?.paidOn}>
                <Input id={`expense-paid-on-${expense.id}`} name="paidOn" type="date" defaultValue={today} max={today} required />
              </FormField>

              <FormField
                label={t("fields.paidBy")}
                htmlFor={`expense-paid-by-${expense.id}`}
                optionalLabel={tCommon("form.optional")}
                errors={result?.errors?.paidById}
              >
                <HabitantPicker
                  id={`expense-paid-by-${expense.id}`}
                  name="paidById"
                  habitants={habitants}
                  value={paidById}
                  onChange={setPaidById}
                  placeholder={t("pay.whoPaid")}
                  clearable
                />
              </FormField>

              <DialogFooter>
                <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
                  {tCommon("actions.cancel")}
                </Button>
                <Button type="submit" loading={submitting}>
                  {submitting ? tCommon("form.saving") : t("actions.markPaid")}
                </Button>
              </DialogFooter>
            </Stack>
          </fieldset>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
