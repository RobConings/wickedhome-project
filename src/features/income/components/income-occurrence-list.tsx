import * as React from "react";
import { CalendarClockIcon, CircleCheckIcon, PencilLineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/shared/card";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import type { Income, IncomeOccurrence, IncomeTargetAccount } from "../types/income";
import { IncomeFormDialog } from "./income-form-dialog";
import { useWhoName } from "./use-income-text";
import { dateText, money } from "@/lib/locale-text";

type IncomeOccurrenceListProps = {
  occurrences: IncomeOccurrence[];
  /** Recorded incomes of the month dated after today that no occurrence shows (one-offs announced ahead). */
  upcoming?: Income[];
  habitants: Habitant[];
  accounts: IncomeTargetAccount[];
  today: string;
  canManage: boolean;
};

/** "Expected 30/10/2026": recorded, but dated after today, so not received yet. */
function ExpectedBadge({ date }: { date: string }) {
  const { t } = useTranslation("income");
  return (
    <Badge variant="outline">
      <CalendarClockIcon />
      {t("status.upcoming", { date: dateText(date) })}
    </Badge>
  );
}

/**
 * The month's planned incomes. A variable one shows "Enter this month's amount" until its actual amount is
 * recorded; a fixed one is expected until someone confirms what came in (optional). Anything recorded with a
 * date after today (an amount entered early, a tax return announced for the 30th) is still expected:
 * "Expected 30/10/2026".
 */
export function IncomeOccurrenceList({ occurrences, upcoming = [], habitants, accounts, today, canManage }: IncomeOccurrenceListProps) {
  const { t } = useTranslation("income");
  const whoName = useWhoName(habitants);
  const [entering, setEntering] = React.useState<IncomeOccurrence | null>(null);

  const avatar = (habitantId: string | null) => {
    const habitant = habitants.find((item) => item.id === habitantId);
    return (
      <span className="grid size-8 shrink-0 place-items-center">
        {habitant ? <HabitantAvatar habitant={habitant} size="sm" /> : <span className="text-xs text-muted-foreground">{t("who.joint").slice(0, 2)}</span>}
      </span>
    );
  };

  type Row = { key: string; date: string; render: () => React.ReactNode };
  const rows: Row[] = [
    ...occurrences.map(
      (occurrence): Row => ({
        key: `${occurrence.sourceId}|${occurrence.date}`,
        date: occurrence.date,
        render: () => {
          const amount = occurrence.income?.amountCents ?? occurrence.plannedCents;
          return (
            <>
              {avatar(occurrence.habitantId)}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{occurrence.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {whoName(occurrence.habitantId)} · {t(`kinds.${occurrence.kind}`)} · {dateText(occurrence.date)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold tabular-nums", occurrence.status !== "received" && "text-muted-foreground")}>
                  {amount !== null ? money(amount) : "—"}
                </span>
                {occurrence.status === "received" ? (
                  <Badge variant="secondary">
                    <CircleCheckIcon />
                    {t("status.received")}
                  </Badge>
                ) : occurrence.status === "upcoming" && occurrence.income ? (
                  <ExpectedBadge date={occurrence.income.date} />
                ) : canManage ? (
                  <Button size="sm" variant={occurrence.status === "to_enter" ? "default" : "outline"} onClick={() => setEntering(occurrence)}>
                    {occurrence.status === "to_enter" ? <PencilLineIcon /> : <CircleCheckIcon />}
                    {occurrence.status === "to_enter" ? t("actions.enterAmountShort") : t("actions.confirmReceived")}
                  </Button>
                ) : (
                  <Badge variant="outline">{t(`status.${occurrence.status}`, { date: dateText(occurrence.date) })}</Badge>
                )}
              </span>
            </>
          );
        },
      }),
    ),
    ...upcoming.map(
      (income): Row => ({
        key: `income|${income.id}`,
        date: income.date,
        render: () => (
          <>
            {avatar(income.habitantId)}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{income.description ?? t(`kinds.${income.kind}`)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {whoName(income.habitantId)} · {t(`kinds.${income.kind}`)} · {t("month.oneOff")}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">{money(income.amountCents)}</span>
              <ExpectedBadge date={income.date} />
            </span>
          </>
        ),
      }),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card>
      <CardTitle>{t("month.planned")}</CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("month.nothingPlanned")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((row) => (
            <li key={row.key} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
              {row.render()}
            </li>
          ))}
        </ul>
      )}
      {entering && (
        <IncomeFormDialog
          key={`${entering.sourceId}|${entering.date}`}
          open
          onOpenChange={(open) => !open && setEntering(null)}
          habitants={habitants}
          accounts={accounts}
          today={today}
          occurrence={entering}
        />
      )}
    </Card>
  );
}
