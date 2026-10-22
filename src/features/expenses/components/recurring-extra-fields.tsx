import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/shared/form-field";
import { EXPENSE_KINDS, type ExpenseKind, type RecurringExpense } from "../types/expenses";

type RecurringKindFieldProps = {
  value: ExpenseKind;
  onChange: (kind: ExpenseKind) => void;
  errors?: Record<string, string[]>;
};

/** Kind of a recurring expense (subscription, loan, down payment…); posts `kind`. Loans show "Total still open". */
export function RecurringKindField({ value, onChange, errors }: RecurringKindFieldProps) {
  const { t } = useTranslation("expenses");
  return (
    <FormField label={t("fields.kind")} htmlFor="expense-kind" errors={errors?.kind}>
      <Select name="kind" value={value} onValueChange={(kind) => onChange(kind as ExpenseKind)}>
        <SelectTrigger id="expense-kind" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPENSE_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

type RecurringExtraFieldsProps = {
  recurring?: Pick<RecurringExpense, "websiteUrl" | "trialEndsOn" | "remindDaysBefore" | "candidateToCancel"> | null;
  errors?: Record<string, string[]>;
};

/** What only a recurring expense has besides its kind: website, trial, reminder, "candidate to cancel". */
export function RecurringExtraFields({ recurring, errors }: RecurringExtraFieldsProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();

  return (
    <>
      <FormField
        label={t("fields.website")}
        htmlFor="expense-website"
        optionalLabel={tCommon("form.optional")}
        errors={errors?.websiteUrl ? [t("errors.website")] : undefined}
      >
        <Input
          id="expense-website"
          name="websiteUrl"
          defaultValue={recurring?.websiteUrl ?? ""}
          placeholder="netflix.com"
          inputMode="url"
          autoComplete="off"
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label={t("fields.trialEndsOn")}
          htmlFor="expense-trial"
          optionalLabel={tCommon("form.optional")}
          errors={errors?.trialEndsOn}
        >
          <Input id="expense-trial" name="trialEndsOn" type="date" defaultValue={recurring?.trialEndsOn ?? ""} />
        </FormField>
        <FormField
          label={t("fields.remindDaysBefore")}
          htmlFor="expense-remind"
          optionalLabel={tCommon("form.optional")}
          description={t("hints.remindDaysBefore")}
          errors={errors?.remindDaysBefore}
        >
          <Input
            id="expense-remind"
            name="remindDaysBefore"
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            defaultValue={recurring?.remindDaysBefore ?? ""}
            placeholder="3"
          />
        </FormField>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          name="candidateToCancel"
          value="true"
          className="mt-0.5 size-4 accent-primary"
          defaultChecked={recurring?.candidateToCancel ?? false}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{t("fields.candidateToCancel")}</span>
          <span className="text-muted-foreground">{t("hints.candidateToCancel")}</span>
        </span>
      </label>
    </>
  );
}
