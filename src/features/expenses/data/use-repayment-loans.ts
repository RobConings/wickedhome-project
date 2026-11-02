import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { RecurringExpense } from "../types/expenses";
import { fetchExpensesOverview } from "./expenses-requests";

/** Forms outside the expenses page fetch choices only when opened. */
export function useRepaymentLoans(open: boolean, provided?: RecurringExpense[]) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = React.useState<RecurringExpense[]>([]);
  React.useEffect(() => {
    if (!open || provided) return;
    let cancelled = false;
    void fetchExpensesOverview().then((data) => {
      if (!cancelled) setLoaded(data.recurring);
    }).catch(() => {
      if (!cancelled) toast.error(t("errors.generic"));
    });
    return () => { cancelled = true; };
  }, [open, provided, t]);
  return (provided ?? loaded).filter((loan) =>
    loan.status !== "ended" && (loan.kind === "loan" || loan.kind === "down_payment" || loan.totalOpen) && loan.totalOpen?.remainingCents !== 0,
  );
}

