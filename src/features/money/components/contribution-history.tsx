import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import * as React from "react";
import { HandCoinsIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageGrid } from "@/components/layout/page-grid";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatTile } from "@/components/shared/stat-tile";
import type { Habitant } from "@/features/household";
import type { ContributionHistory as History, ContributionPlan, JointAccount } from "../types/money";
import { MoneyCardHeader } from "./money-card-header";
import { money, monthLabel, usePersonName } from "./use-money-text";

type ContributionHistoryProps = {
  data: History;
  accounts: JointAccount[];
  plans: ContributionPlan[];
  habitants: Habitant[];
};

/** All-time totals and a compact, yearly comparison of recorded contributions per month. */
export function ContributionHistory({ data, accounts, plans, habitants }: ContributionHistoryProps) {
  const { t } = useTranslation("money");
  const personName = usePersonName(habitants);
  const [accountId, setAccountId] = React.useState("joint");
  const [year, setYear] = React.useState(data.today.slice(0, 4));
  const selected = accounts.filter((account) => accountId === "joint" ? account.kind === "joint" : account.id === accountId);
  const accountIds = new Set(selected.map((account) => account.id));
  const rows = data.rows.filter((row) => accountIds.has(row.accountId));
  const ids = new Set<string | null>([
    ...selected.flatMap((account) => account.ownerIds),
    ...plans.filter((plan) => accountIds.has(plan.accountId)).map((plan) => plan.habitantId),
    ...rows.map((row) => row.habitantId),
  ]);
  const people = [...ids].sort((a, b) => personName(a).localeCompare(personName(b)));
  const name = (id: string | null) => id === null ? t("history.unknownPerson") : personName(id);
  const total = (person?: string | null) => rows.filter((row) => person === undefined || row.habitantId === person).reduce((sum, row) => sum + row.amountCents, 0);
  const firstYear = Math.min(Number(data.today.slice(0, 4)), ...data.rows.map((row) => Number(row.month.slice(0, 4))));
  const years = Array.from({ length: Number(data.today.slice(0, 4)) - firstYear + 1 }, (_, index) => String(Number(data.today.slice(0, 4)) - index));
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(12 - index).padStart(2, "0")}`).filter((month) => month <= data.today.slice(0, 7));
  const monthRows = new Map(months.map((month) => [month, rows.filter((row) => row.month === month)]));
  const amount = (month: string, person?: string | null) => (monthRows.get(month) ?? []).filter((row) => person === undefined || row.habitantId === person).reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <Stack gap="lg" className="min-w-0">
      <Inline gap="md" align="stretch" wrap>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-full sm:w-64" aria-label={t("history.account")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="joint">{t("history.allJoint")}</SelectItem>
            {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Inline>
      <PageGrid columns="stats">
        <StatTile icon={HandCoinsIcon} tone="featured" label={t("history.total")} value={money(total())} hint={t("history.allTime")} />
        {people.map((id) => <StatTile key={id ?? "unknown"} icon={UserIcon} label={name(id)} value={money(total(id))} hint={t("history.allTime")} />)}
      </PageGrid>
      <Card>
        <Inline gap="md" align="start" justify="between" wrap>
          <MoneyCardHeader icon={HandCoinsIcon} title={t("history.title")} description={t("history.description")} />
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28" aria-label={t("history.year")}><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </Inline>
        {rows.length === 0 ? (
          <EmptyState icon={HandCoinsIcon} title={t("history.empty")} description={t("history.emptyDescription")} />
        ) : (
          <div className="divide-y">
            {months.map((month) => (
              <section key={month} aria-label={monthLabel(month)} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <Inline gap="sm" align="baseline" justify="between" wrap>
                  <h3 className="text-sm font-semibold">{monthLabel(month)}</h3>
                  <span className="text-sm font-semibold tabular-nums">{t("history.monthTotal", { amount: money(amount(month)) })}</span>
                </Inline>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((id) => (
                    <Inline gap="md" align="baseline" justify="between" key={id ?? "unknown"} className="min-w-0 text-sm">
                      <dt className="break-words text-muted-foreground">{name(id)}</dt>
                      <dd className="shrink-0 tabular-nums">{money(amount(month, id))}</dd>
                    </Inline>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
        <Text size="xs" tone="muted">{t("history.note")}</Text>
      </Card>
    </Stack>
  );
}
