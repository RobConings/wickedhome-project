import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { DateBlock } from "@/components/shared/date-block";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { ExpensesSummary } from "@/features/expenses";
import type { TasksSummary } from "@/features/tasks";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { upcomingItems } from "../data/dashboard-items";

type UpcomingCardProps = {
  today: string;
  /** Each `null` when it failed to load. */
  expenses: ExpensesSummary | null;
  tasks: TasksSummary | null;
};

/** The next two weeks: expenses to pay and tasks, soonest first. */
export function UpcomingCard({ today, expenses, tasks }: UpcomingCardProps) {
  const { t } = useTranslation("dashboard");
  const locale = currentLocale();
  const items = upcomingItems(today, { expenses, tasks });
  const sources = [expenses, tasks];
  const failures = sources.filter((source) => source === null).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>{t("upcoming.title")}</CardTitle>
          <CardDescription>{t("upcoming.description")}</CardDescription>
        </div>
      </CardHeader>

      {failures === sources.length ? (
        <InlineAlert tone="error">{t("loadError")}</InlineAlert>
      ) : (
        <>
          {failures > 0 && <InlineAlert tone="error">{t("upcoming.partial")}</InlineAlert>}
          {items.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <DateBlock date={item.date} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link to={item.href} className="truncate text-sm font-medium outline-none hover:underline focus-visible:underline">
                      {item.title}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        t(`upcoming.kinds.${item.kind}`),
                        item.detail,
                        item.amountCents !== null && formatCurrency(item.amountCents, locale),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t("upcoming.empty")}</p>
          )}
        </>
      )}
    </Card>
  );
}
