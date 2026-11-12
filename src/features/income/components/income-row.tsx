import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { RecordLink } from "@/components/shared/record-link";
import { CalendarClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import { isReceived } from "../types/income-calculations";
import type { Income, IncomeSource, IncomeTargetAccount } from "../types/income";
import { dateText, money, useWhoName } from "./use-income-text";

type IncomeRowProps = {
  income: Income;
  habitants: Habitant[];
  sources: IncomeSource[];
  accounts: IncomeTargetAccount[];
  /** `YYYY-MM-DD`: an income dated after it is still expected ("Expected 30/10/2026"), not received. */
  today: string;
  /** Tile layout (a card) instead of a list row. */
  tile?: boolean;
};

/** One recorded income: what, who, when, where it landed, and the amount. Dated after today: upcoming. */
export function IncomeRow({ income, habitants, sources, accounts, today, tile = false }: IncomeRowProps) {
  const { t } = useTranslation("income");
  const whoName = useWhoName(habitants);
  const habitant = habitants.find((item) => item.id === income.habitantId);
  const source = sources.find((item) => item.id === income.sourceId);
  const account = accounts.find((item) => item.id === income.targetAccountId);
  const received = isReceived(income, today);
  const title = income.description ?? source?.name ?? t(`kinds.${income.kind}`);
  const details = [
    whoName(income.habitantId),
    t(`kinds.${income.kind}`),
    income.periodDate && income.periodDate !== income.date ? t("incomes.forPeriod", { date: dateText(income.periodDate) }) : null,
    account ? t("incomes.toAccount", { account: account.name }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const upcomingBadge = !received && (
    <Badge variant="outline" className="shrink-0">
      <CalendarClockIcon />
      {t("status.upcoming", { date: dateText(income.date) })}
    </Badge>
  );

  if (tile) {
    return (
      <Stack gap="xs" className="h-full">
        <span className={cn("text-lg font-semibold tabular-nums", !received && "text-muted-foreground")}>{money(income.amountCents)}</span>
        <RecordLink to={`/income/receipts/${encodeURIComponent(income.id)}`} className="break-words text-sm font-medium underline">{title}</RecordLink>
        {received ? <span className="text-xs text-muted-foreground">{dateText(income.date)}</span> : <span>{upcomingBadge}</span>}
        <span className="line-clamp-2 text-xs text-muted-foreground">{details}</span>
      </Stack>
    );
  }
  return (
    <Inline gap="md" align="center" className="min-h-11">
      <span className="grid size-8 shrink-0 place-items-center">{habitant && <HabitantAvatar habitant={habitant} size="sm" />}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <RecordLink to={`/income/receipts/${encodeURIComponent(income.id)}`} className="break-words text-sm font-medium underline">{title}</RecordLink>
        <span className="truncate text-xs text-muted-foreground">
          {dateText(income.date)} · {details}
        </span>
      </span>
      {upcomingBadge}
      <span className={cn("text-sm font-semibold tabular-nums", received ? "text-success" : "text-muted-foreground")}>
        {received ? "+" : ""}
        {money(income.amountCents)}
      </span>
    </Inline>
  );
}
