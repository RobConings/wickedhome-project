import { useTranslation } from "react-i18next";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { MailLinkTarget } from "../types/mail-matching";

/** "22/10/2026" */
export const shortMailDate = (date: string) => formatDate(date, currentLocale());

/** "Luminus · 22/10/2026 · € 225,00 (recurring)": an expense a mail may belong to, in one line. */
export function useMatchLine() {
  const { t } = useTranslation("integrations");
  return (target: Pick<MailLinkTarget, "payee" | "dueDate" | "amountCents" | "recurringExpenseId">) =>
    [target.payee, shortMailDate(target.dueDate), formatCurrency(target.amountCents, currentLocale())].join(" · ") +
    (target.recurringExpenseId ? ` ${t("link.recurringTag")}` : "");
}
