import { CategorySelect, type ExpenseCategory } from "@/features/expenses";
import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { currentLocale } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format";
import type { ShoppingFinanceOptions, SessionView } from "../types/sessions";
import { recordSessionPayment } from "../data/sessions-requests";

const selectClass =
  "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
export function SessionPayments({
  session,
  purchase,
  disabled,
  onAction,
  payeeDefault,
}: {
  payeeDefault: string;
  session: SessionView;
  purchase: SessionView["purchases"][number];
  disabled: boolean;
  onAction: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const [options, setOptions] = React.useState<ShoppingFinanceOptions | null>(
    null,
  );
  const [existingId, setExistingId] = React.useState("");
  const [category, setCategory] = React.useState<ExpenseCategory>("groceries");
  const categoryId = React.useId();
  const [payerType, setPayerType] = React.useState<"joint" | "person">("joint");
  React.useEffect(() => {
    let cancelled = false;
    void api
      .get<ShoppingFinanceOptions>(
        `/shopping/sessions/${session.id}/finance-options`,
      )
      .then((value) => {
        if (!cancelled) setOptions(value);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, purchase.payments.length]);
  const total = purchase.payments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">{t("payments.title")}</h3>
      <p className="text-sm">
        {t("payments.recorded", { total: formatCurrency(total, locale) })}
        {purchase.totalCents !== null
          ? ` / ${formatCurrency(purchase.totalCents, locale)}`
          : ""}
      </p>
      {purchase.payments.map((payment) => (
        <p className="text-sm" key={payment.id}>
          {payment.expenseId ? (
            <Link className="underline" to={`/expenses/${payment.expenseId}`}>
              {payment.payee} · {formatCurrency(payment.amountCents, locale)}
            </Link>
          ) : (
            <span>
              {t("payments.deletedExpense")} ·{" "}
              {formatCurrency(payment.amountCents, locale)}
            </span>
          )}
          {payment.paymentAccountId && (
            <span>
              {" "}
              ·{" "}
              {
                options?.accounts.find(
                  (account) => account.id === payment.paymentAccountId,
                )?.name
              }
            </span>
          )}
        </p>
      ))}
      {options ? (
        <details className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm">
            {t("payments.manage")}
          </summary>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = (name: string) => String(form.get(name) ?? "");
              const date = value("date");
              void onAction(() =>
                recordSessionPayment(session.id, {
                  reference: value("reference"),
                  receiptId: value("receiptId") || undefined,
                  expenseId: existingId || undefined,
                  expense: existingId
                    ? undefined
                    : {
                        payee: value("payee"),
                        amountCents: Math.round(Number(value("amount")) * 100),
                        category,
                        payerType,
                        payerHabitantId: value("payerId") || undefined,
                        shares: [],
                        kind: "other",
                        candidateToCancel: false,
                        dueDate: date,
                        paidOn: date,
                        shopId: purchase.shopId,
                        paymentMethod: value("method") as
                          | "card"
                          | "cash"
                          | "meal_voucher"
                          | "wire_transfer"
                          | "other",
                      },
                  paymentAccountId: value("accountId") || undefined,
                  paidByHabitantId: value("paidBy") || undefined,
                }),
              );
            }}
          >
            <label className="text-sm">
              {t("payments.existing")}
              <select
                className={selectClass}
                value={existingId}
                onChange={(event) => setExistingId(event.target.value)}
              >
                <option value="">{t("payments.newExpense")}</option>
                {options.expenses.map((expense) => (
                  <option key={expense.id} value={expense.id}>
                    {expense.payee} ·{" "}
                    {formatCurrency(expense.amountCents, locale)} ·{" "}
                    {expense.paidOn}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("payments.receipt")}
              <select
                className={selectClass}
                name="receiptId"
                defaultValue={
                  purchase.receipts.length === 1 ? purchase.receipts[0]!.id : ""
                }
              >
                <option value="">{t("payments.wholeVisit")}</option>
                {purchase.receipts.map((receipt) => (
                  <option key={receipt.id} value={receipt.id}>
                    {receipt.filename}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("payments.reference")}
              <Input
                name="reference"
                required
                defaultValue="card-1"
                maxLength={100}
              />
            </label>
            <fieldset
              disabled={Boolean(existingId) || disabled}
              className="grid gap-3 sm:col-span-2 sm:grid-cols-2"
            >
              <label className="text-sm">
                {t("payments.payee")}
                <Input
                  name="payee"
                  defaultValue={payeeDefault.slice(0, 64)}
                  maxLength={64}
                  required
                />
              </label>
              <label className="text-sm">
                {t("payments.amount")}
                <Input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={
                    purchase.totalCents !== null
                      ? ((purchase.totalCents - total) / 100).toFixed(2)
                      : undefined
                  }
                />
              </label>
              <label className="text-sm" htmlFor={categoryId}>
                {t("fields.category")}
                <CategorySelect
                  id={categoryId}
                  value={category}
                  onChange={setCategory}
                  first="everyday"
                />
              </label>
              <label className="text-sm">
                {t("payments.date")}
                <Input
                  name="date"
                  type="date"
                  defaultValue={purchase.purchasedAt.slice(0, 10)}
                  required
                />
              </label>
              <label className="text-sm">
                {t("payments.method")}
                <select name="method" className={selectClass}>
                  <option value="card">{t("payments.card")}</option>
                  <option value="cash">{t("payments.cash")}</option>
                  <option value="meal_voucher">
                    {t("payments.mealVouchers")}
                  </option>
                  <option value="wire_transfer">
                    {t("payments.transfer")}
                  </option>
                  <option value="other">{t("payments.other")}</option>
                </select>
              </label>
              <label className="text-sm">
                {t("payments.payerType")}
                <select
                  className={selectClass}
                  value={payerType}
                  onChange={(event) =>
                    setPayerType(event.target.value as "joint" | "person")
                  }
                >
                  <option value="joint">{t("payments.joint")}</option>
                  <option value="person">{t("payments.personal")}</option>
                </select>
              </label>
              {payerType === "person" && (
                <label className="text-sm">
                  {t("payments.person")}
                  <select name="payerId" required className={selectClass}>
                    <option value="">{t("payments.choosePerson")}</option>
                    {options.habitants.map((person) => (
                      <option value={person.id} key={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm">
                {t("payments.account")}
                <select name="accountId" className={selectClass}>
                  <option value="">{t("payments.defaultAccount")}</option>
                  {options.accounts.map((account) => (
                    <option value={account.id} key={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("payments.paidBy")}
                <select name="paidBy" className={selectClass}>
                  <option value="">{t("payments.unspecified")}</option>
                  {options.habitants.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t("payments.splitHint")}
            </p>
            <Button disabled={disabled}>{t("payments.save")}</Button>
          </form>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">{t("payments.loading")}</p>
      )}
    </section>
  );
}

export function RelatedShoppingSessions({ expenseId }: { expenseId: string }) {
  const { t } = useTranslation("shopping");
  const [visits, setVisits] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  React.useEffect(() => {
    let cancelled = false;
    void api
      .get<{ id: string; name: string }[]>(
        `/shopping/sessions/for-expense/${encodeURIComponent(expenseId)}`,
      )
      .then((rows) => {
        if (!cancelled) setVisits(rows);
      })
      .catch(() => {
        if (!cancelled) setVisits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);
  return visits.length ? (
    <div className="flex flex-wrap gap-2 text-sm">
      <span>{t("sessions.title")}:</span>
      {visits.map((visit) => (
        <Link
          className="underline"
          to={`/shopping/sessions/${visit.id}`}
          key={visit.id}
        >
          {visit.name}
        </Link>
      ))}
    </div>
  ) : null;
}
