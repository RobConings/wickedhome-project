import { ArrowRightIcon, ReceiptIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";
import type { MoneyMonth } from "../types/money";
import { MoneyCardHeader } from "./money-card-header";
import { dateText, money } from "./use-money-text";

type JointOutgoingsCardProps = {
  outgoings: MoneyMonth["jointOutgoings"];
  today: string;
};

/** Joint expenses of the month: what is paid (it lowers the joint balance) and what is still to pay. */
export function JointOutgoingsCard({ outgoings, today }: JointOutgoingsCardProps) {
  const { t } = useTranslation("money");
  const items = [...outgoings.items].sort((a, b) => (a.paidOn ? 1 : 0) - (b.paidOn ? 1 : 0) || a.dueDate.localeCompare(b.dueDate));
  return (
    <Card className="min-w-0 gap-3">
      <MoneyCardHeader
        icon={ReceiptIcon}
        title={t("outgoings.title")}
        actions={
          <Link to="/expenses?payer=joint" className="flex min-h-10 items-center gap-1 text-sm text-primary hover:underline">
            {t("actions.viewExpenses")}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted px-3 py-2">
          <span className="block text-xs text-muted-foreground">{t("outgoings.paidLabel")}</span>
          <span className="font-semibold tabular-nums">{money(outgoings.paidCents)}</span>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2">
          <span className="block text-xs text-muted-foreground">{t("outgoings.upcomingLabel")}</span>
          <span className="font-semibold tabular-nums">{money(outgoings.upcomingCents)}</span>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("outgoings.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/expenses/${item.id}`} className="flex min-h-11 items-center gap-3 py-1.5 text-sm hover:text-primary">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.payee}</span>
                  <span className={cn("text-xs text-muted-foreground", !item.paidOn && item.dueDate < today && "text-destructive")}>
                    {item.paidOn ? t("outgoings.paidOn", { date: dateText(item.paidOn) }) : t("outgoings.dueOn", { date: dateText(item.dueDate) })}
                  </span>
                </span>
                <span className={cn("font-semibold tabular-nums", item.paidOn && "text-muted-foreground")}>{money(item.amountCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
