import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import type { TotalOpenPreview } from "../types/total-open";
import { useTotalOpenSummary } from "./use-expense-text";

type TotalOpenFieldsProps = {
  totalCents: number | null;
  onTotalChange: (cents: number | null) => void;
  asOf: string;
  onAsOfChange: (date: string) => void;
  /** Stored total of the loan being edited (prefills the field). */
  defaultTotalCents?: number | null;
  preview: TotalOpenPreview | null;
  /** The amount per payment is filled in. */
  hasAmount: boolean;
  errors?: Record<string, string[]>;
  className?: string;
};

/**
 * "Total still open" (money) with its "as of" date, and what it means: the number of payments, a partial
 * last payment and its date. The repeat end is then set from it (see `RecurrenceFields lockedEnd`).
 */
export function TotalOpenFields({
  totalCents,
  onTotalChange,
  asOf,
  onAsOfChange,
  defaultTotalCents,
  preview,
  hasAmount,
  errors,
  className,
}: TotalOpenFieldsProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const locale = currentLocale();
  const summary = useTotalOpenSummary();

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label={t("totalOpen.label")}
          htmlFor="expense-total-open"
          optionalLabel={tCommon("form.optional")}
          errors={errors?.totalOpenCents ? [preview?.tooMany ? t("totalOpen.tooMany") : t("errors.totalOpen")] : undefined}
        >
          <MoneyInput
            id="expense-total-open"
            name="totalOpenCents"
            placeholder="0,00"
            defaultValueCents={defaultTotalCents ?? undefined}
            onValueChange={onTotalChange}
            aria-describedby="expense-total-open-hint"
          />
        </FormField>
        <FormField label={t("totalOpen.asOf")} htmlFor="expense-total-open-as-of" description={t("totalOpen.asOfHint")} errors={errors?.totalOpenAsOf}>
          <Input
            id="expense-total-open-as-of"
            name="totalOpenAsOf"
            type="date"
            value={asOf}
            disabled={totalCents === null}
            onChange={(event) => onAsOfChange(event.target.value)}
          />
        </FormField>
      </div>
      <div id="expense-total-open-hint" aria-live="polite" className="text-xs text-muted-foreground">
        {totalCents === null ? (
          t("totalOpen.hint")
        ) : !hasAmount || !preview ? (
          t("totalOpen.needAmount")
        ) : preview.tooMany ? (
          <span className="font-medium text-destructive">{t("totalOpen.tooMany")}</span>
        ) : (
          <span className="flex flex-col gap-0.5">
            {preview.paidCents > 0 && (
              <span>
                {t("totalOpen.paidSince", {
                  amount: formatCurrency(preview.paidCents, locale),
                  remaining: formatCurrency(preview.remainingCents, locale),
                })}
              </span>
            )}
            {preview.count === 0 ? (
              <span className="font-medium text-foreground">{t("totalOpen.paidOff")}</span>
            ) : (
              <span className="font-medium text-foreground">{summary(preview)}</span>
            )}
            {preview.lastDate && <span>{t("totalOpen.lastOn", { date: formatDate(preview.lastDate, locale) })}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
