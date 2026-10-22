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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stack } from "./stack";
import { FormField } from "./form-field";
import { InlineAlert } from "./inline-alert";
import { MoneyInput } from "./money-input";
import { useOptionalCurrentUser } from "@/features/auth";
import type { Habitant } from "@/features/household";
import { ShopPicker, useShopSelections, type Shop } from "@/features/shops";
import type { ExpenseActionResult } from "../data/expenses-loaders";
import type { ExpenseProjectField } from "./expense-form-dialog";
import { PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod } from "../types/expenses";
import { CategorySelect } from "./category-select";
import { PayerField } from "./payer-field";

type LogExpenseDialogProps = {
  habitants: Habitant[];
  shops: Shop[];
  /** Default date: today in the household time zone. */
  today: string;
  trigger: React.ReactElement;
  defaultOpen?: boolean;
  /** Optional "Project" field, composed by the route (see `ExpenseProjectField`). */
  projectField?: ExpenseProjectField;
  /** Log it for this project (e.g. from the project's page); preselected in `projectField`, else posted as is. */
  projectId?: string | null;
  /** Pre-filled amount (e.g. bought materials not logged yet). */
  defaultAmountCents?: number;
  /** Pre-filled "what". */
  defaultDescription?: string;
  /** Route that saves it; defaults to the current one (use "/expenses" from other pages). */
  action?: string;
  /** After saving, with the new expense's id. */
  onSaved?: (expenseId: string) => void;
};

/**
 * "Log an expense": everyday spending that is already paid (groceries, eating out, fuel, a gift…). Amount
 * first and big, today's date, a category, an optional shop, who paid and how (card by default). Saved
 * straight away as paid, so it lands in History, not in Upcoming.
 *
 * Deliberately not a `GeneralFormDialog`: it is the seconds-fast phone flow. The amount is a big autofocused
 * input, category and date sit side by side even on a 375 px screen (the shared form grid stacks them, pushing
 * "who paid" below the fold), and the posted payee is derived live from what/shop/category.
 */
export function LogExpenseDialog({
  habitants,
  shops,
  today,
  trigger,
  defaultOpen = false,
  projectField,
  projectId = null,
  defaultAmountCents,
  defaultDescription = "",
  action,
  onSaved,
}: LogExpenseDialogProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const [open, setOpen] = React.useState(defaultOpen);
  const [session, setSession] = React.useState(0);
  const fetcher = useFetcher<ExpenseActionResult>({ key: `expense-log-${session}` });
  const { recordUse } = useShopSelections();
  const [amountCents, setAmountCents] = React.useState<number | null>(null);
  const [category, setCategory] = React.useState<ExpenseCategory>("groceries");
  const [shopId, setShopId] = React.useState<string | null>(null);
  const [what, setWhat] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [method, setMethod] = React.useState<PaymentMethod>("card");
  const meHabitantId = useOptionalCurrentUser()?.habitantId ?? null;

  const submitting = fetcher.state !== "idle";
  const result = fetcher.data;
  const errors = result?.errors;
  const saved = fetcher.state === "idle" && result?.ok === true;
  const shop = shops.find((candidate) => candidate.id === shopId);
  // The payee is what was typed, else the shop, else the category: logging stays a few taps.
  const payee = what.trim() || shop?.name || t(`categories.${category}`);

  const savedCallback = React.useRef(onSaved);
  React.useEffect(() => {
    savedCallback.current = onSaved;
  });

  React.useEffect(() => {
    if (!saved) return;
    toast.success(t("log.saved"));
    if (shopId) void recordUse(shopId);
    if (result?.expenseId) savedCallback.current?.(result.expenseId);
  }, [saved, shopId, recordUse, t, result?.expenseId]);

  function handleOpenChange(next: boolean) {
    if (submitting && !next) return;
    if (next) {
      setSession((value) => value + 1);
      setAmountCents(defaultAmountCents ?? null);
      setWhat(defaultDescription);
      setShopId(null);
      setDate(today);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open && !saved} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <fetcher.Form method="post" action={action} noValidate>
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="payee" value={payee} />
          {!projectField && projectId && <input type="hidden" name="projectId" value={projectId} />}
          <input type="hidden" name="paidOn" value={date} />
          <input type="hidden" name="paymentMethod" value={method} />
          <fieldset disabled={submitting} className="contents">
            <Stack gap="lg">
              <DialogHeader>
                <DialogTitle>{t("log.title")}</DialogTitle>
                <DialogDescription>{t("log.description")}</DialogDescription>
              </DialogHeader>

              {result?.formError && <InlineAlert tone="error">{result.formError}</InlineAlert>}

              <FormField label={t("fields.amount")} htmlFor="log-amount" errors={errors?.amountCents ? [t("errors.amount")] : undefined}>
                <MoneyInput
                  id="log-amount"
                  name="amountCents"
                  defaultValueCents={defaultAmountCents ?? null}
                  placeholder="0,00"
                  inputMode="decimal"
                  autoFocus
                  onValueChange={setAmountCents}
                  className="[&_input]:h-14 [&_input]:text-3xl [&_input]:font-semibold [&_input]:tabular-nums"
                  required
                />
              </FormField>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label={t("fields.category")} htmlFor="log-category" errors={errors?.category}>
                  <CategorySelect id="log-category" value={category} onChange={setCategory} first="everyday" />
                </FormField>
                <FormField label={t("fields.date")} htmlFor="log-date" errors={errors?.dueDate}>
                  <Input
                    id="log-date"
                    name="dueDate"
                    type="date"
                    value={date}
                    max={today}
                    onChange={(event) => setDate(event.target.value || today)}
                    required
                  />
                </FormField>
              </div>

              <FormField label={t("fields.shop")} htmlFor="log-shop" optionalLabel={tCommon("form.optional")} errors={errors?.shopId}>
                <ShopPicker
                  id="log-shop"
                  name="shopId"
                  shops={shops}
                  value={shopId}
                  onChange={setShopId}
                  placeholder={t("placeholders.shop")}
                  clearable
                />
              </FormField>

              <FormField
                label={t("fields.description")}
                htmlFor="log-what"
                optionalLabel={tCommon("form.optional")}
                errors={errors?.payee}
              >
                <Input
                  id="log-what"
                  value={what}
                  onChange={(event) => setWhat(event.target.value)}
                  placeholder={payee}
                  maxLength={64}
                  autoComplete="off"
                />
              </FormField>

              <FormField label={t("fields.paymentMethod")} htmlFor="log-method">
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                  <SelectTrigger id="log-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.filter((value) => value !== "direct_debit").map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`methods.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {projectField?.({ defaultValue: projectId })}

              <FormField label={t("payer.label")} htmlFor="log-payer">
                <div id="log-payer">
                  <PayerField
                    amountCents={amountCents}
                    habitants={habitants}
                    personOnly={method === "meal_voucher"}
                    meHabitantId={meHabitantId}
                    error={
                      errors?.payerType
                        ? t("errors.mealVoucherJoint")
                        : errors?.shares
                          ? t("errors.shares")
                          : errors?.payerHabitantId
                            ? t("errors.payer")
                            : undefined
                    }
                  />
                </div>
              </FormField>

              <DialogFooter>
                <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
                  {tCommon("actions.cancel")}
                </Button>
                <Button type="submit" loading={submitting}>
                  {submitting ? tCommon("form.saving") : tCommon("actions.save")}
                </Button>
              </DialogFooter>
            </Stack>
          </fieldset>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
