import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { MailLinkTarget } from "../types/mail-matching";
import { dateText } from "@/lib/locale-text";

/** "22/10/2026" */

/** "Luminus · 22/10/2026 · € 225,00 (recurring)": an expense a mail may belong to, in one line. */
export function useMatchLine() {
  const { t } = useTranslation("integrations");
  return (target: Pick<MailLinkTarget, "payee" | "dueDate" | "amountCents" | "recurringExpenseId">) =>
    [target.payee, dateText(target.dueDate), formatCurrency(target.amountCents, currentLocale())].join(" · ") +
    (target.recurringExpenseId ? ` ${t("link.recurringTag")}` : "");
}
