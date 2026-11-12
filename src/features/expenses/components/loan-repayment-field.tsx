import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
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
    <Stack gap="sm">
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
          <Inline gap="sm" align="center" justify="between" wrap className="text-sm">
            <span>{t("repayment.remaining", { amount: formatCurrency(selected.totalOpen.remainingCents, currentLocale()) })}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => onPayAll(selected.totalOpen!.remainingCents)}>{t("repayment.payAll")}</Button>
          </Inline>
          <Text size="xs" tone="muted">{t("repayment.hint")} {t("repayment.paymentDateHint")}</Text>
        </>
      ) : <Text size="xs" tone="warning">{t("repayment.needsTotal")}</Text>)}
    </Stack>
  );
}
