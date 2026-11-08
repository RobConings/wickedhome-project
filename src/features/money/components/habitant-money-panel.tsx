import { HandCoinsIcon, LandmarkIcon, TicketIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Card, CardTitle } from "@/components/shared/card";
import { PeriodNavigator } from "@/components/shared/period-navigator";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addMonthsClamped, todayIn } from "@/types/dates";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchMoneyMonth } from "../data/money-requests";
import { moneyMonthSchema, type MoneyMonth } from "../types/money";
import { money, monthLabel } from "./use-money-text";

/** Household composes this Money-owned read view for adults; money changes remain on the owner page. */
export function HabitantMoneyPanel({ habitantId, initial }: { habitantId: string; initial?: MoneyMonth }) {
  const { t } = useTranslation("money");
  const { t: common } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const requested = search.get("month");
  const month = requested && moneyMonthSchema.safeParse(requested).success ? requested : todayIn().slice(0, 7);
  const resource = useAsyncResource(`person-money:${habitantId}:${month}`, () => fetchMoneyMonth(month), { initial });
  const change = (value: string) => setSearch((previous) => { const next = new URLSearchParams(previous); next.set("month", value); return next; }, { preventScrollReset: true });
  const data = resource.data;
  const plans = data?.plans.filter((plan) => plan.habitantId === habitantId) ?? [];
  const contributions = data?.contributions.filter((row) => row.habitantId === habitantId) ?? [];
  const accounts = data?.accounts.filter((account) => account.ownerIds.includes(habitantId)) ?? [];
  return <Card tone="section">
    <CardTitle>{t("personWorkspace.title")}</CardTitle>
    <PeriodNavigator label={monthLabel(month)} onPrevious={() => change(addMonthsClamped(`${month}-01`, -1).slice(0, 7))} onNext={() => change(addMonthsClamped(`${month}-01`, 1).slice(0, 7))} onToday={() => change(todayIn().slice(0, 7))} previousLabel={t("month.previous")} nextLabel={t("month.next")} todayLabel={t("month.today")} isCurrent={month === todayIn().slice(0, 7)} />
    {resource.loading && <Skeleton className="h-28 rounded-xl" />}
    {resource.error && <div className="flex flex-col items-start gap-2 text-sm" role="status"><p>{common("errors.generic")}</p><Button onClick={resource.refresh} variant="outline" size="sm">{common("actions.retry")}</Button></div>}
    {data && <>
      {contributions.length ? <ul className="divide-y">{contributions.map((row) => <li key={row.accountId} className="py-3"><RecordLink to={`/money?tab=history&month=${month}&account=${encodeURIComponent(row.accountId)}`} className="flex min-h-11 items-center gap-2 font-medium hover:underline"><HandCoinsIcon className="size-4 shrink-0" />{data.accounts.find((account) => account.id === row.accountId)?.name ?? t("planWorkspace.unknownAccount")}</RecordLink><p className="text-sm text-muted-foreground">{t("personWorkspace.contribution", { planned: money(row.plannedCents), recorded: money(row.recordedCents) })}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("personWorkspace.noContributions")}</p>}
      {plans.length > 0 && <div><h4 className="text-sm font-semibold">{t("contributions.plans")}</h4><ul>{plans.map((plan) => <li key={plan.id}><RecordLink to={`/money/plans/${encodeURIComponent(plan.id)}?month=${month}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm hover:underline"><span>{data.accounts.find((account) => account.id === plan.accountId)?.name ?? t("planWorkspace.unknownAccount")}</span><span className="tabular-nums">{money(plan.amountCents)}</span></RecordLink></li>)}</ul></div>}
      {accounts.length > 0 && <div><h4 className="text-sm font-semibold">{t("personWorkspace.accounts")}</h4><ul>{accounts.map((account) => <li key={account.id}><RecordLink to={`/money?tab=history&account=${encodeURIComponent(account.id)}&month=${month}`} className="flex min-h-11 items-center gap-2 text-sm hover:underline"><LandmarkIcon className="size-4 shrink-0" />{account.name}</RecordLink></li>)}</ul></div>}
      <RecordLink to={`/income/vouchers/${encodeURIComponent(habitantId)}`} className="flex min-h-11 items-center gap-2 text-sm font-medium hover:underline"><TicketIcon className="size-4 shrink-0" />{t("personWorkspace.vouchers")}</RecordLink>
    </>}
  </Card>;
}
