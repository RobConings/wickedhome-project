import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { RecurringExpense } from "../types/expenses";

/** Optional loan link in the existing expense form; the amount remains the expense's amount. */
export function LoanRepaymentField({ id, loans, value, onChange, onPayAll }: {
  id: string;
  loans: RecurringExpense[];
  value: string | null;
  onChange: (id: string | null) => void;
  onPayAll: (amountCents: number) => void;
}) {
  const { t } = useTranslation("expenses");
  const selected = loans.find((loan) => loan.id === value);
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="earlyRepaymentForId" value={value ?? ""} />
      <Select value={value ?? "none"} onValueChange={(next) => onChange(next === "none" ? null : next)}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("repayment.none")}</SelectItem>
          {loans.map((loan) => <SelectItem key={loan.id} value={loan.id}>{loan.payee}</SelectItem>)}
        </SelectContent>
      </Select>
      {selected && (selected.totalOpen ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{t("repayment.remaining", { amount: formatCurrency(selected.totalOpen.remainingCents, currentLocale()) })}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => onPayAll(selected.totalOpen!.remainingCents)}>{t("repayment.payAll")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("repayment.hint")} {t("repayment.paymentDateHint")}</p>
        </>
      ) : <p className="text-xs text-warning">{t("repayment.needsTotal")}</p>)}
    </div>
  );
}
