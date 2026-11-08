import { todayIn } from "@/types/dates";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CategorySelect, type ExpenseCategory } from "@/features/expenses";
import { Button } from "@/components/ui/button";
import { EntityPicker } from "@/components/shared/entity-picker";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import type { GeneralFormField } from "@/components/shared/general-form";
import { RelatedRecordCards } from "@/components/shared/related-record-cards";
import { RecordLink } from "@/components/shared/record-link";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ShoppingCartIcon } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAsyncResource } from "@/lib/use-async-resource";
import { currentLocale } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format";
import { sessionPaymentFormSchema } from "../data/sessions-actions";
import type { ShoppingFinanceOptions, SessionView } from "../types/sessions";

export function SessionPayments({ session, purchase, disabled, payeeDefault, initialOptions }: {
  payeeDefault: string; session: SessionView; purchase: SessionView["purchases"][number]; disabled: boolean;
  initialOptions?: ShoppingFinanceOptions;
}) {
  const { t } = useTranslation("shopping"); const locale = currentLocale();
  const resource = useAsyncResource(`session-finance:${session.id}:${purchase.payments.length}`, () => api.get<ShoppingFinanceOptions>(`/shopping/sessions/${encodeURIComponent(session.id)}/finance-options`), { initial: initialOptions });
  const [reference, setReference] = useState(() => crypto.randomUUID());
  const options = resource.data;
  const total = purchase.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const isNew = (values: Record<string, unknown>) => values.mode !== "existing";
  const picker = (name: string, label: string, items: { id: string; label: string }[], when?: GeneralFormField["when"]): GeneralFormField => ({ name, label, type: "custom", optional: true, when,
    render: ({ id, name, value, setValue, disabled, invalid }) => <EntityPicker id={id} name={name} value={typeof value === "string" ? value : null} onChange={setValue} items={items} disabled={disabled} invalid={invalid} /> });
  const fields: GeneralFormField[] = [
    { name: "mode", type: "select", label: t("payments.existing"), options: [{ value: "new", label: t("payments.newExpense") }, { value: "existing", label: t("payments.linkExisting") }] },
    picker("expenseId", t("payments.existing"), options?.expenses.map((expense) => ({ id: expense.id, label: `${expense.payee} · ${formatCurrency(expense.amountCents, locale)}${expense.paidOn ? ` · ${expense.paidOn}` : ""}` })) ?? [], (values) => !isNew(values)),
    { name: "payee", optional: false, type: "text", label: t("payments.payee"), when: isNew },
    { name: "amountCents", optional: false, type: "money", label: t("payments.amount"), when: isNew },
    { name: "date", optional: false, type: "date", label: t("payments.date"), when: isNew },
    { name: "category", optional: false, type: "custom", label: t("fields.category"), when: isNew, render: ({ id, name, value, setValue, disabled }) => <CategorySelect name={name} id={id} value={value as ExpenseCategory} onChange={setValue} disabled={disabled} first="everyday" /> },
    { name: "method", optional: false, type: "select", label: t("payments.method"), when: isNew, options: (["card", "cash", "meal_voucher", "wire_transfer", "other"] as const).map((value) => ({ value, label: t(`payments.${({ card: "card", cash: "cash", meal_voucher: "mealVouchers", wire_transfer: "transfer", other: "other" })[value]}`) })) },
    { name: "payerType", optional: false, type: "select", label: t("payments.payerType"), when: isNew, options: [{ value: "joint", label: t("payments.joint") }, { value: "person", label: t("payments.personal") }] },
    picker("payerId", t("payments.person"), options?.habitants.map((person) => ({ id: person.id, label: person.name })) ?? [], (values) => isNew(values) && values.payerType === "person"),
    picker("accountId", t("payments.account"), options?.accounts.map((account) => ({ id: account.id, label: account.name })) ?? [], isNew),
    picker("paidBy", t("payments.paidBy"), options?.habitants.map((person) => ({ id: person.id, label: person.name })) ?? [], isNew),
    picker("receiptId", t("payments.receipt"), purchase.receipts.map((receipt) => ({ id: receipt.id, label: receipt.filename }))),
  ];
  return <section className="space-y-3 border-t pt-4"><h3 className="font-medium">{t("payments.title")}</h3>
    <p className="text-sm">{t("payments.recorded", { total: formatCurrency(total, locale) })}{purchase.totalCents !== null ? ` / ${formatCurrency(purchase.totalCents, locale)}` : ""}</p>
    {purchase.payments.map((payment) => <p className="text-sm" key={payment.id}>{payment.expenseId ? <RecordLink className="inline-flex min-h-11 items-center gap-2 rounded-lg font-medium underline" to={`/expenses/${encodeURIComponent(payment.expenseId)}`}>{payment.payee} · {formatCurrency(payment.amountCents, locale)}</RecordLink> : <span>{t("payments.deletedExpense")} · {formatCurrency(payment.amountCents, locale)}</span>}</p>)}
    {resource.error && <InlineAlert tone="error">{t("errors.generic")} <Button variant="outline" onClick={resource.refresh}>{t("payments.retry")}</Button></InlineAlert>}
    {options ? <GeneralFormDialog trigger={<Button variant="outline" disabled={disabled}><PlusIcon />{t("payments.manage")}</Button>}
      title={t("payments.manage")} description={t("payments.splitHint")} intent="record-payment" action={`/shopping/sessions/${encodeURIComponent(session.id)}`}
      schema={sessionPaymentFormSchema} fields={fields} hiddenFields={{ reference, shopId: purchase.shopId }} submitLabel={t("payments.save")}
      onOpenChange={(open) => { if (open) setReference(crypto.randomUUID()); }} onSuccess={resource.refresh}
      defaultValues={{ mode: "new", payee: payeeDefault.slice(0, 64), amountCents: purchase.totalCents === null ? undefined : Math.max(0, purchase.totalCents - total), date: todayIn(undefined, new Date(purchase.purchasedAt)), method: "card", category: "groceries", payerType: "joint", receiptId: purchase.receipts.length === 1 ? purchase.receipts[0]!.id : undefined }}
    /> : !resource.error && <p className="text-sm text-muted-foreground">{t("payments.loading")}</p>}
  </section>;
}

export function RelatedShoppingSessions({ expenseId }: { expenseId: string }) {
  const { t } = useTranslation("shopping");
  const resource = useAsyncResource(`expense-visits:${expenseId}`, () => api.get<{ id: string; name: string }[]>(`/shopping/sessions/for-expense/${encodeURIComponent(expenseId)}`));
  if (resource.error) return <InlineAlert tone="error">{t("errors.generic")}</InlineAlert>;
  return resource.data?.length ? <RelatedRecordCards label={t("sessions.title")} items={resource.data.map((visit) => ({ id: visit.id, label: visit.name, to: `/shopping/sessions/${encodeURIComponent(visit.id)}`, icon: ShoppingCartIcon, accent: "shopping" }))} /> : null;
}
