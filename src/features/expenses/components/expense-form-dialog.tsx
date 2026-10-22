import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/shared/form-field";
import type { GeneralFormCustomFieldProps, GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { MoneyInput } from "@/components/shared/money-input";
import { RecurrenceFields } from "@/components/shared/recurrence-fields";
import { useOptionalCurrentUser } from "@/features/auth";
import type { Habitant } from "@/features/household";
import { ShopPicker, type Shop } from "@/features/shops";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { useSelections } from "@/lib/selections";
import { formatDate } from "@/types/date-format";
import type { ExpenseActionResult } from "../data/expenses-loaders";
import { exactYearlyCents } from "../types/expense-calculations";
import {
  EXPENSE_RRULE_SUPPORT,
  type Expense,
  type ExpenseCategory,
  type ExpenseKind,
  type PayeeSuggestion,
  type RecurringExpense,
} from "../types/expenses";
import { formatIban } from "../types/payment-references";
import { totalOpenPreviewFor } from "../types/total-open";
import { CategorySelect } from "./category-select";
import { PayeeField } from "./payee-field";
import { PayerField } from "./payer-field";
import { PaymentDetailsFields, type PaymentDetailsValues } from "./payment-details-fields";
import { RecurringExtraFields, RecurringKindField } from "./recurring-extra-fields";
import { TotalOpenFields } from "./total-open-fields";

type Scope = "expense" | "recurring";

type ExpenseFormDialogProps = {
  /** Edit this expense; omit (with `recurring`) to create a new one. */
  expense?: Expense;
  /** The recurring expense: of `expense` (offers "this and all upcoming ones"), or on its own to edit the template. */
  recurring?: RecurringExpense | null;
  habitants: Habitant[];
  /** Shops for the optional shop of a one-off expense. */
  shops?: Shop[];
  /** Previous payees for quick reselection. */
  payees?: PayeeSuggestion[];
  /** Default due date for a new expense. */
  today: string;
  trigger: React.ReactElement;
  /** Open when it mounts (`/expenses?new=1`, e.g. the dashboard's quick action). */
  defaultOpen?: boolean;
  /** Optional "Project" field (see `ExpenseProjectField`). */
  projectField?: ExpenseProjectField;
  /** New expense only: pre-filled values (e.g. a bill suggested from mail); everything stays editable. */
  defaults?: ExpenseFormDefaults;
  /** Route that saves it; defaults to the current one (use "/expenses" from other pages). */
  action?: string;
  /** After creating, with the new expense's id. */
  onSaved?: (expenseId: string) => void;
};

/** Values a new expense can start with (see `defaults`). */
export type ExpenseFormDefaults = Partial<
  Pick<
    Expense,
    "payee" | "amountCents" | "dueDate" | "category" | "description" | "paymentMethod" | "beneficiaryName" | "iban" | "structuredCommunication" | "reference"
  >
>;

/**
 * A "Project" field for the expense forms, composed by the route (the projects feature's `ProjectFormField`); it
 * must post `projectId`. Expenses don't know projects: without the slot, the project stays as it is.
 */
export type ExpenseProjectField = (props: { defaultValue: string | null }) => React.ReactNode;

const initialPayment = (source?: Expense | RecurringExpense | null): PaymentDetailsValues => ({
  paymentMethod: source?.paymentMethod ?? null,
  beneficiaryName: source?.beneficiaryName ?? "",
  iban: source?.iban ? formatIban(source.iban) : "",
  bic: source?.bic ?? "",
});

/** The errors of several posted names, for the composite fields that show their own. */
const errorsOf = (errorsFor: GeneralFormCustomFieldProps["errorsFor"], names: readonly string[]) => {
  const record: Record<string, string[]> = {};
  for (const name of names) {
    const messages = errorsFor(name);
    if (messages) record[name] = messages;
  }
  return record;
};

const PAYMENT_NAMES = ["beneficiaryName", "iban", "bic", "structuredCommunication", "reference"] as const;
const TOTAL_OPEN_NAMES = ["totalOpenAsOf"] as const;
const EXTRA_NAMES = ["trialEndsOn", "remindDaysBefore", "candidateToCancel"] as const;
const PAYER_NAMES = ["payerType", "payerHabitantId", "shares"] as const;

/**
 * Add or edit an expense: one-off or recurring ("Repeats" with the shared recurrence fields), payment
 * method and details, and who pays. A `GeneralFormDialog`: the payee, amount, recurrence, total still open,
 * payment details, payer split and project are custom fields that share their values here (the payer split
 * follows the amount, the total still open sets the repeat's end). While it saves (which for a recurring one
 * also creates or updates the upcoming expenses) the fields are locked and the dialog stays open.
 */
export function ExpenseFormDialog({
  expense,
  recurring,
  habitants,
  shops = [],
  payees = [],
  today,
  trigger,
  defaultOpen = false,
  projectField,
  defaults,
  action,
  onSaved,
}: ExpenseFormDialogProps) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const [open, setOpen] = React.useState(defaultOpen);
  const { recordUse } = useSelections("payee");
  const meHabitantId = useOptionalCurrentUser()?.habitantId ?? null;

  const editsTemplateOnly = !expense && Boolean(recurring);
  const isEdit = Boolean(expense) || editsTemplateOnly;
  const inRecurring = Boolean(expense?.recurringExpenseId && recurring);
  const initialScope: Scope = editsTemplateOnly ? "recurring" : "expense";
  const sourceFor = (forScope: Scope) =>
    (forScope === "recurring" && recurring ? recurring : expense) ?? (isEdit ? undefined : (defaults as Expense | undefined));
  const defaultDate = editsTemplateOnly ? (recurring?.startDate ?? today) : (expense?.dueDate ?? defaults?.dueDate ?? today);

  const [scope, setScope] = React.useState<Scope>(initialScope);
  // A new expense with `defaults` reads them like an existing one (only the fields in ExpenseFormDefaults exist).
  const source = sourceFor(scope);
  // The payee as typed or picked, for "recently used" after saving.
  const typedPayee = React.useRef(source?.payee ?? "");
  const [repeats, setRepeats] = React.useState(false);
  const [amountCents, setAmountCents] = React.useState<number | null>(source?.amountCents ?? null);
  const [category, setCategory] = React.useState<ExpenseCategory>(source?.category ?? "energy");
  const [payment, setPayment] = React.useState<PaymentDetailsValues>(() => initialPayment(source));
  const [dueDate, setDueDate] = React.useState(defaultDate);
  const [rrule, setRrule] = React.useState(recurring?.rrule ?? "FREQ=MONTHLY");
  const [kind, setKind] = React.useState<ExpenseKind>(recurring?.kind ?? "subscription");
  const [totalCents, setTotalCents] = React.useState<number | null>(recurring?.totalOpen?.totalCents ?? null);
  const [asOf, setAsOf] = React.useState(recurring?.totalOpen?.asOf ?? "");

  /** Every opening starts from the expense as it is now. */
  const reset = () => {
    const fresh = sourceFor(initialScope);
    setScope(initialScope);
    setRepeats(false);
    setAmountCents(fresh?.amountCents ?? null);
    setCategory(fresh?.category ?? "energy");
    setPayment(initialPayment(fresh));
    setDueDate(defaultDate);
    setRrule(recurring?.rrule ?? "FREQ=MONTHLY");
    setKind(recurring?.kind ?? "subscription");
    setTotalCents(recurring?.totalOpen?.totalCents ?? null);
    setAsOf(recurring?.totalOpen?.asOf ?? "");
    typedPayee.current = fresh?.payee ?? "";
  };

  const totalOpenPreview = totalOpenPreviewFor({
    amountCents,
    totalCents,
    asOf,
    rrule,
    startDate: dueDate || today,
    nextDueDate: recurring?.nextDueDate,
    progress: recurring?.totalOpen,
  });
  const totalOpenEnd = totalCents !== null && totalOpenPreview && !totalOpenPreview.tooMany ? totalOpenPreview : null;
  const loanKind = kind === "loan" || kind === "down_payment";
  const recurringFields = isEdit ? scope === "recurring" : repeats;
  const intent = !isEdit ? "create" : scope === "recurring" ? "update-recurring" : "update";
  const idValue = scope === "recurring" ? (recurring?.id ?? expense?.recurringExpenseId) : expense?.id;

  function pickPayee(payee: PayeeSuggestion) {
    typedPayee.current = payee.name;
    setCategory(payee.category);
    setPayment((current) => ({
      paymentMethod: current.paymentMethod ?? payee.paymentMethod,
      beneficiaryName: current.beneficiaryName || payee.beneficiaryName || "",
      iban: current.iban || (payee.iban ? formatIban(payee.iban) : ""),
      bic: current.bic || payee.bic || "",
    }));
  }

  const totalOpenFields = (errorsFor: GeneralFormCustomFieldProps["errorsFor"], className: string) => (
    <TotalOpenFields
      className={className}
      totalCents={totalCents}
      onTotalChange={setTotalCents}
      asOf={asOf}
      onAsOfChange={setAsOf}
      defaultTotalCents={totalCents}
      preview={totalOpenPreview}
      hasAmount={amountCents !== null}
      errors={errorsOf(errorsFor, ["totalOpenCents", ...TOTAL_OPEN_NAMES])}
    />
  );

  const fields: GeneralFormField[] = [
    {
      name: "scope",
      type: "custom",
      label: t("scope.label"),
      bare: true,
      hidden: !inRecurring,
      // Not posted: it picks the intent and the id.
      render: () => (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("scope.label")}</legend>
          {(["expense", "recurring"] as const).map((value) => (
            <label key={value} className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
              <input type="radio" className="size-4 accent-primary" checked={scope === value} onChange={() => setScope(value)} />
              {t(`scope.${value}`)}
            </label>
          ))}
        </fieldset>
      ),
    },
    {
      name: "payee",
      type: "custom",
      label: t("fields.payee"),
      render: ({ id, name, invalid, describedBy }) => (
        // Remembers the typed payee, for "recently used" after saving.
        <div
          onChange={(event) => {
            typedPayee.current = (event.target as HTMLInputElement).value;
          }}
        >
          <PayeeField
            id={id}
            name={name}
            defaultValue={source?.payee}
            payees={payees}
            onPick={pickPayee}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        </div>
      ),
    },
    {
      name: "amountCents",
      type: "custom",
      label: t("fields.amount"),
      span: "half",
      bare: true,
      render: ({ id, name, errors }) => (
        <FormField label={t("fields.amount")} htmlFor={id} errors={errors ? [t("errors.amount")] : undefined}>
          <MoneyInput
            id={id}
            name={name}
            placeholder="0,00"
            inputMode="decimal"
            defaultValueCents={source?.amountCents}
            onValueChange={setAmountCents}
            required
          />
        </FormField>
      ),
    },
    {
      name: "dueDate",
      type: "custom",
      label: recurringFields ? t("fields.firstDueDate") : t("fields.dueDate"),
      span: "half",
      render: ({ id, name, invalid, describedBy }) => (
        <Input
          id={id}
          name={name}
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      ),
    },
    {
      name: "category",
      type: "custom",
      label: t("fields.category"),
      render: ({ id, name, invalid, describedBy }) => (
        <CategorySelect id={id} name={name} value={category} onChange={setCategory} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      ),
    },
    {
      name: "repeats",
      type: "custom",
      label: t("fields.repeats"),
      bare: true,
      hidden: isEdit,
      // Not posted: a new expense repeats when it has a rule.
      render: () => (
        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{t("fields.repeats")}</span>
            <span className="text-muted-foreground">{t("hints.repeats")}</span>
          </span>
          <Switch checked={repeats} onCheckedChange={setRepeats} aria-label={t("fields.repeats")} />
        </label>
      ),
    },
    {
      name: "kind",
      type: "custom",
      label: t("fields.kind"),
      bare: true,
      hidden: !recurringFields,
      render: ({ errorsFor }) => <RecurringKindField value={kind} onChange={setKind} errors={errorsOf(errorsFor, ["kind"])} />,
    },
    {
      name: "rrule",
      type: "custom",
      label: t("fields.recurrence"),
      bare: true,
      hidden: !recurringFields,
      render: ({ id, name, errors }) => (
        <FormField label={t("fields.recurrence")} htmlFor={id}>
          <RecurrenceFields
            name={name}
            id={id}
            label=""
            defaultValue={recurring?.rrule ?? "FREQ=MONTHLY"}
            startDate={dueDate || today}
            frequencies={EXPENSE_RRULE_SUPPORT.frequencies}
            weekdays={false}
            allowNone={false}
            errors={errors ? [t("errors.rrule")] : undefined}
            onChange={setRrule}
            lockedEnd={
              totalOpenEnd
                ? {
                    until: totalOpenEnd.lastDate,
                    description: totalOpenEnd.lastDate
                      ? t("totalOpen.lockedEnd", {
                          count: totalOpenEnd.count,
                          date: formatDate(totalOpenEnd.lastDate, locale),
                        })
                      : t("totalOpen.paidOff"),
                  }
                : undefined
            }
          />
        </FormField>
      ),
    },
    {
      name: "totalOpenCents",
      type: "custom",
      label: t("totalOpen.more"),
      bare: true,
      hidden: !recurringFields,
      errorNames: TOTAL_OPEN_NAMES,
      // Loans and down payments show it at once; other kinds keep it folded.
      render: ({ errorsFor }) =>
        loanKind ? (
          totalOpenFields(errorsFor, "rounded-lg border border-primary/30 bg-primary/5 p-3")
        ) : (
          <details className="group rounded-lg border p-3" open={Boolean(recurring?.totalOpen) || undefined}>
            <summary className="flex min-h-8 cursor-pointer items-center text-sm font-medium">{t("totalOpen.more")}</summary>
            {totalOpenFields(errorsFor, "mt-3")}
          </details>
        ),
    },
    { name: "description", type: "text", label: t("fields.description"), optional: true, maxLength: 200, placeholder: t("placeholders.description") },
    {
      name: "shopId",
      type: "custom",
      label: t("fields.shop"),
      optional: true,
      hidden: recurringFields || shops.length === 0,
      render: ({ id, name }) => (
        <ShopPicker id={id} name={name} shops={shops} defaultValue={expense?.shopId ?? null} placeholder={t("placeholders.shop")} clearable />
      ),
    },
    {
      name: "paymentMethod",
      type: "custom",
      label: t("fields.paymentMethod"),
      bare: true,
      errorNames: PAYMENT_NAMES,
      render: ({ errorsFor }) => (
        <PaymentDetailsFields
          values={payment}
          onChange={setPayment}
          defaultStructuredCommunication={source?.structuredCommunication}
          defaultReference={source?.reference}
          errors={errorsOf(errorsFor, ["paymentMethod", ...PAYMENT_NAMES])}
        />
      ),
    },
    {
      name: "payerType",
      type: "custom",
      label: t("payer.label"),
      bare: true,
      errorNames: PAYER_NAMES,
      // The payer split stays this feature's own editor: joint, one person, or shares that follow the amount.
      render: ({ id, errorsFor }) => (
        <FormField label={t("payer.label")} htmlFor={id}>
          <div id={id}>
            <PayerField
              amountCents={amountCents}
              habitants={habitants}
              defaultPayerType={source?.payerType}
              defaultHabitantId={source?.payerHabitantId}
              defaultShares={source?.shares}
              personOnly={payment.paymentMethod === "meal_voucher"}
              meHabitantId={meHabitantId}
              error={
                errorsFor("payerType")
                  ? t("errors.mealVoucherJoint")
                  : errorsFor("shares")
                    ? t("errors.shares")
                    : errorsFor("payerHabitantId")
                      ? t("errors.payer")
                      : undefined
              }
            />
          </div>
        </FormField>
      ),
    },
    {
      name: "websiteUrl",
      type: "custom",
      label: t("fields.website"),
      bare: true,
      hidden: !recurringFields,
      errorNames: EXTRA_NAMES,
      render: ({ errorsFor }) => <RecurringExtraFields recurring={recurring} errors={errorsOf(errorsFor, ["websiteUrl", ...EXTRA_NAMES])} />,
    },
    {
      name: "normalisedCost",
      type: "custom",
      label: "",
      bare: true,
      hidden: !recurringFields || amountCents === null,
      render: () => amountCents !== null && <NormalisedCost amountCents={amountCents} rrule={rrule} locale={locale} />,
    },
    {
      name: "projectId",
      type: "custom",
      label: "",
      bare: true,
      hidden: !projectField,
      render: () => projectField?.({ defaultValue: source?.project?.id ?? null }),
    },
    { name: "notes", type: "textarea", label: t("fields.notes"), optional: true, rows: 2, maxLength: 2000 },
  ];

  return (
    <GeneralFormDialog<ExpenseActionResult>
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
      title={!isEdit ? t("form.createTitle") : scope === "recurring" ? t("form.editRecurringTitle") : t("form.editTitle")}
      description={t("form.description")}
      successMessage={!isEdit ? t("form.created") : scope === "recurring" ? t("form.recurringUpdated") : t("form.updated")}
      action={action}
      intent={intent}
      hiddenFields={{ id: isEdit ? idValue : undefined }}
      fields={fields}
      defaultValues={{ description: source?.description ?? "", notes: source?.notes ?? "" }}
      submittingLabel={
        intent === "update-recurring" ? t("loading.updatingRecurring") : intent === "create" && repeats ? t("loading.creatingRecurring") : undefined
      }
      onSuccess={(result) => {
        const payee = typedPayee.current.trim();
        if (payee) void recordUse(payee);
        if (!isEdit && result.expenseId) onSaved?.(result.expenseId);
      }}
    />
  );
}

/** "That's € 12,99 per month, € 155,88 per year." for the current rhythm. */
function NormalisedCost({ amountCents, rrule, locale }: { amountCents: number; rrule: string; locale: ReturnType<typeof currentLocale> }) {
  const { t } = useTranslation("expenses");
  const yearly = exactYearlyCents(amountCents, rrule);
  if (yearly === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {t("form.normalised", {
        monthly: formatCurrency(Math.round(yearly / 12), locale),
        yearly: formatCurrency(Math.round(yearly), locale),
      })}
    </p>
  );
}
