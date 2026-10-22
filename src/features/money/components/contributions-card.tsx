import * as React from "react";
import { HandCoinsIcon, HandshakeIcon, PencilIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { HabitantAvatar, type Habitant } from "@/features/household";
import type { FormResult } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { settleContributions, type AccountSettlement, type PersonSettlement } from "../types/contribution-settlement";
import { monthBounds, planActiveIn } from "../types/money-calculations";
import type { ContributionPlan, ContributionRow, JointAccount } from "../types/money";
import { ContributionPlanDialog } from "./contribution-plan-dialog";
import { MoneyCardHeader } from "./money-card-header";
import { RecordTransferDialog, type TransferDefaults } from "./record-transfer-dialog";
import { TakeBackDialog } from "./take-back-dialog";
import { accountName, usePersonName } from "./use-money-text";
import { useFetcherResult } from "@/lib/hooks/use-fetcher-result";
import { dateText, money, signedMoney } from "@/lib/locale-text";
import { useCanManage } from "@/lib/permissions";

type ContributionsCardProps = {
  rows: ContributionRow[];
  plans: ContributionPlan[];
  accounts: JointAccount[];
  habitants: Habitant[];
  month: string;
  today: string;
  /** Defaults to the nearest `CanManageProvider`. */
  canManage?: boolean;
  className?: string;
};

/** A card action: full width on phones, its own size from `sm` up; the label wraps instead of overflowing. */
const ACTION_BUTTON = "h-auto min-h-10 min-w-0 whitespace-normal py-2 max-sm:flex-1 max-sm:basis-full";

type TakeBack = { habitantId: string; accountId: string; amountCents: number };

/** Toast when a quick action (fetcher) is done or failed. */
function useFetcherToast(fetcher: ReturnType<typeof useFetcher<FormResult>>, success: string) {
  const { t: tCommon } = useTranslation();
  useFetcherResult(fetcher, (result) => {
    if (result.ok) toast.success(success);
    else toast.error(result.formError ?? tCommon("errors.generic"));
  });
}

/**
 * Contributions to the joint accounts this month, settled per person: planned, actually transferred (net of
 * what was taken back), and the result ("€ 800,00 too much", "still € 1.450,00 to transfer", "Done"). Below:
 * what still needs to happen, the netting alternative and the end result. Plans are managed here too.
 */
export function ContributionsCard({ rows, plans, accounts, habitants, month, today, canManage: canManageProp, className }: ContributionsCardProps) {
  const canManage = useCanManage(canManageProp);
  const { t } = useTranslation("money");
  const personName = usePersonName(habitants);
  // One fetcher per quick action, so each answers with its own toast.
  const planFetcher = useFetcher<FormResult>();
  const keepFetcher = useFetcher<FormResult>();
  const unkeepFetcher = useFetcher<FormResult>();
  const directFetcher = useFetcher<FormResult>();
  useFetcherToast(planFetcher, t("ledger.deleted"));
  useFetcherToast(keepFetcher, t("settlement.keptSaved"));
  useFetcherToast(unkeepFetcher, t("settlement.unkeptSaved"));
  useFetcherToast(directFetcher, t("settlement.directSaved"));
  const busy = [keepFetcher, unkeepFetcher, directFetcher].some((item) => item.state !== "idle");
  const [transfer, setTransfer] = React.useState<TransferDefaults | null>(null);
  const [takeBack, setTakeBack] = React.useState<TakeBack | null>(null);
  const [editing, setEditing] = React.useState<ContributionPlan | null>(null);
  const monthStart = `${month}-01`;
  const monthPlans = plans.filter((plan) => planActiveIn(plan, month));
  const settlements = React.useMemo(() => settleContributions(rows), [rows]);
  const order = (id: string) => habitants.findIndex((habitant) => habitant.id === id);

  // Settling a past month dates things on its last day, a future one on its first; this month: today.
  const { to: monthEnd } = monthBounds(month);
  const settleDate = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today;

  return (
    <Card className={cn("min-w-0 gap-4", className)}>
      <MoneyCardHeader
        icon={HandCoinsIcon}
        title={t("contributions.title")}
        description={t("contributions.description")}
        actions={
          canManage &&
          accounts.length > 0 && (
            <ContributionPlanDialog
              accounts={accounts}
              habitants={habitants}
              monthStart={monthStart}
              trigger={
                <Button variant="outline" size="sm" className={ACTION_BUTTON}>
                  <PlusIcon />
                  {t("actions.addPlan")}
                </Button>
              }
            />
          )
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("contributions.none")}</p>
      ) : (
        settlements.map((settlement) => (
          <section key={settlement.accountId} className="flex flex-col gap-3" aria-label={accountName(accounts, settlement.accountId)}>
            {settlements.length > 1 && (
              <h4 className="text-sm font-semibold">{t("contributions.toAccount", { account: accountName(accounts, settlement.accountId) })}</h4>
            )}
            <ul className="flex flex-col divide-y">
              {[...settlement.people]
                .sort((a, b) => order(a.habitantId) - order(b.habitantId))
                .map((person) => (
                  <PersonRow
                    key={person.habitantId}
                    person={person}
                    habitant={habitants.find((item) => item.id === person.habitantId)}
                    name={personName(person.habitantId)}
                    personName={personName}
                    today={today}
                    canManage={canManage}
                    onRecord={() =>
                      setTransfer({
                        from: `habitant:${person.habitantId}`,
                        toAccountId: person.accountId,
                        amountCents: person.shortCents || null,
                        date: person.plannedDate ?? today,
                      })
                    }
                    onTakeBack={() => setTakeBack({ habitantId: person.habitantId, accountId: person.accountId, amountCents: person.overCents })}
                    onKeepExtra={(amountCents) =>
                      (amountCents === 0 ? unkeepFetcher : keepFetcher).submit(
                        { intent: "keep-extra", habitantId: person.habitantId, accountId: person.accountId, month, amountCents },
                        { method: "post" },
                      )
                    }
                    busy={busy}
                  />
                ))}
            </ul>
            <SettlementSummary
              settlement={settlement}
              accountLabel={accountName(accounts, settlement.accountId)}
              personName={personName}
              canManage={canManage}
              onDirect={(payment) =>
                directFetcher.submit(
                  { intent: "direct-payment", ...payment, accountId: settlement.accountId, date: settleDate },
                  { method: "post" },
                )
              }
            />
          </section>
        ))
      )}

      {canManage && monthPlans.length > 0 && (
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="min-h-10 cursor-pointer py-2 font-medium">{t("contributions.plans")}</summary>
          <ul className="flex flex-col divide-y">
            {monthPlans.map((plan) => (
              <li key={plan.id} className="flex items-start gap-2 py-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium break-words">
                    {personName(plan.habitantId)} → {accountName(accounts, plan.accountId)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("contributions.planAmount", { amount: money(plan.amountCents), day: plan.dayOfMonth })}
                    {" · "}
                    {plan.activeTo
                      ? t("contributions.planPeriod", { from: dateText(plan.activeFrom), to: dateText(plan.activeTo) })
                      : t("contributions.planSince", { date: dateText(plan.activeFrom) })}
                  </span>
                </span>
                <Button variant="ghost" size="icon" className="size-10" aria-label={t("actions.editPlan")} onClick={() => setEditing(plan)}>
                  <PencilIcon />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="size-10" aria-label={t("actions.deletePlan")}>
                      <Trash2Icon />
                    </Button>
                  }
                  title={t("form.deletePlanTitle")}
                  description={t("form.deletePlanDescription")}
                  confirmLabel={t("actions.deletePlan")}
                  destructive
                  onConfirm={() => planFetcher.submit({ intent: "delete-plan", id: plan.id }, { method: "post" })}
                />
              </li>
            ))}
          </ul>
        </details>
      )}

      {transfer && (
        <RecordTransferDialog open onOpenChange={(open) => !open && setTransfer(null)} accounts={accounts} habitants={habitants} today={today} defaults={transfer} />
      )}
      {takeBack && (
        <TakeBackDialog
          open
          onOpenChange={(open) => !open && setTakeBack(null)}
          habitantId={takeBack.habitantId}
          personName={personName(takeBack.habitantId)}
          accountId={takeBack.accountId}
          accountName={accountName(accounts, takeBack.accountId)}
          amountCents={takeBack.amountCents}
          today={settleDate}
        />
      )}
      {editing && (
        <ContributionPlanDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          accounts={accounts}
          habitants={habitants}
          monthStart={monthStart}
          plan={editing}
        />
      )}
    </Card>
  );
}

type PersonRowProps = {
  person: PersonSettlement;
  habitant: Habitant | undefined;
  name: string;
  personName: (id: string | null | undefined) => string;
  today: string;
  canManage: boolean;
  busy: boolean;
  onRecord: () => void;
  onTakeBack: () => void;
  onKeepExtra: (amountCents: number) => void;
};

/** One person: planned, transferred, the result in a semantic tone, the actions and (on expand) the transfers. */
function PersonRow({ person, habitant, name, personName, today, canManage, busy, onRecord, onTakeBack, onKeepExtra }: PersonRowProps) {
  const { t } = useTranslation("money");
  const due = person.plannedDate !== null && person.plannedDate <= today;
  const status =
    person.status === "over"
      ? { variant: "warning" as const, label: t("contributions.over", { amount: money(person.overCents) }) }
      : person.status === "short"
        ? { variant: due ? ("soon" as const) : ("info" as const), label: t("contributions.short", { amount: money(person.shortCents) }) }
        : {
            variant: "success" as const,
            label: person.keptExtraCents > 0 ? t("contributions.keptExtra", { amount: money(person.keptExtraCents) }) : t("contributions.done"),
          };

  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-[min(100%,12rem)] flex-1 items-center gap-2">
          {habitant && <HabitantAvatar habitant={habitant} size="sm" />}
          <span className="font-medium break-words">{name}</span>
        </span>
        <Badge variant={status.variant} className="h-auto max-w-full py-0.5 whitespace-normal">
          {status.label}
        </Badge>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0">
          <dt className="text-xs text-muted-foreground">{t("contributions.plannedLabel")}</dt>
          <dd className="tabular-nums">
            {person.plannedCents > 0 ? money(person.plannedCents) : t("contributions.noPlan")}
            {person.plannedDate && <span className="text-xs text-muted-foreground"> {t("contributions.plannedOn", { date: dateText(person.plannedDate) })}</span>}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0">
          <dt className="text-xs text-muted-foreground">{t("contributions.transferredLabel")}</dt>
          <dd className="font-semibold tabular-nums">{money(person.transferredCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:justify-start sm:gap-0">
          <dt className="text-xs text-muted-foreground">{t("contributions.differenceLabel")}</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              person.status === "over" && "text-warning",
              person.status === "short" && (due ? "text-soon" : "text-info"),
              person.status === "done" && "text-success",
            )}
          >
            {person.differenceCents === 0 ? money(0) : signedMoney(person.differenceCents)}
          </dd>
        </div>
      </dl>

      {canManage && (person.status !== "done" || person.keptExtraCents > 0) && (
        <div className="flex flex-wrap gap-2">
          {person.status === "short" && (
            <Button size="sm" className={ACTION_BUTTON} onClick={onRecord}>
              {t("actions.record")}
            </Button>
          )}
          {person.status === "over" && (
            <>
              <Button size="sm" variant="outline" className={ACTION_BUTTON} onClick={onTakeBack}>
                <Undo2Icon />
                {t("actions.takeBack")}
              </Button>
              <Button size="sm" variant="outline" className={ACTION_BUTTON} disabled={busy} onClick={() => onKeepExtra(person.keptExtraCents + person.overCents)}>
                {t("actions.keepExtra")}
              </Button>
            </>
          )}
          {person.status !== "over" && person.keptExtraCents > 0 && (
            <Button size="sm" variant="ghost" className={ACTION_BUTTON} disabled={busy} onClick={() => onKeepExtra(0)}>
              {t("actions.unkeepExtra")}
            </Button>
          )}
        </div>
      )}

      {person.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("contributions.noTransfers")}</p>
      ) : (
        <details className="group text-sm">
          <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {t("contributions.transfers", { count: person.entries.length })}
          </summary>
          <ul className="flex flex-col gap-2 border-l-2 pl-3">
            {person.entries.map((entry) => {
              const label = entry.counterpartHabitantId
                ? entry.amountCents >= 0
                  ? t("contributions.directPaid", { name: personName(entry.counterpartHabitantId) })
                  : t("contributions.directReceived", { name: personName(entry.counterpartHabitantId) })
                : entry.amountCents < 0
                  ? t("contributions.takenBack")
                  : null;
              return (
                <li key={entry.id || `${entry.date}-${entry.amountCents}`} className="flex flex-col">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      {dateText(entry.date)}
                      {label && <span className="text-muted-foreground"> · {label}</span>}
                      {entry.note && <span className="text-muted-foreground"> · {entry.note}</span>}
                    </span>
                    <span className="font-medium tabular-nums">{signedMoney(entry.amountCents)}</span>
                  </span>
                  {entry.absorbed && <span className="text-xs text-muted-foreground">{t("contributions.absorbed")}</span>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
  );
}

type SettlementSummaryProps = {
  settlement: AccountSettlement;
  accountLabel: string;
  personName: (id: string | null | undefined) => string;
  canManage: boolean;
  /** Returns the submit's promise, so the confirm dialog stays busy until it is done. */
  onDirect: (payment: { fromHabitantId: string; toHabitantId: string; amountCents: number }) => Promise<void> | void;
};

/** What still needs to happen this month, the netting alternative and the explicit end result. */
function SettlementSummary({ settlement, accountLabel, personName, canManage, onDirect }: SettlementSummaryProps) {
  const { t } = useTranslation("money");
  if (settlement.people.length === 0) return null;
  const total = money(settlement.totalCents);

  if (settlement.settled) {
    return settlement.totalCents > 0 ? (
      <InlineAlert tone="success">{t("settlement.settled", { total, account: accountLabel })}</InlineAlert>
    ) : null;
  }

  const endPeople = settlement.endResult.map((item) => `${personName(item.habitantId)} ${money(item.amountCents)}`).join(" · ");
  const netting = settlement.netting;
  const stepText = (step: AccountSettlement["steps"][number], netted = false) =>
    step.kind === "transfer"
      ? netted
        ? t("settlement.nettingTransfer", { name: personName(step.habitantId), amount: money(step.amountCents), account: accountLabel })
        : t("settlement.transfer", { name: personName(step.habitantId), amount: money(step.amountCents), account: accountLabel })
      : netted
        ? t("settlement.nettingTakeBack", { name: personName(step.habitantId), amount: money(step.amountCents) })
        : t("settlement.takeBack", { name: personName(step.habitantId), amount: money(step.amountCents) });

  let nettingNode: React.ReactNode = null;
  if (netting) {
    const [first] = netting.direct;
    const only = netting.direct.length === 1 && first ? first : null;
    const [rest] = netting.steps;
    if (only && netting.steps.length === 0) {
      nettingNode = <p>{t("settlement.nettingExact", { from: personName(only.fromHabitantId), to: personName(only.toHabitantId), amount: money(only.amountCents) })}</p>;
    } else if (only && netting.steps.length === 1 && rest?.kind === "transfer" && rest.habitantId === only.fromHabitantId) {
      nettingNode = (
        <p>
          {t("settlement.nettingSimple", {
            from: personName(only.fromHabitantId),
            to: personName(only.toHabitantId),
            amount: money(only.amountCents),
            rest: money(rest.amountCents),
            account: accountLabel,
          })}
        </p>
      );
    } else {
      nettingNode = (
        <div className="flex flex-col gap-1">
          <p>{t("settlement.nettingIntro")}</p>
          <ul className="list-disc pl-5">
            {netting.direct.map((payment) => (
              <li key={`${payment.fromHabitantId}-${payment.toHabitantId}`}>
                {t("settlement.nettingDirect", { from: personName(payment.fromHabitantId), to: personName(payment.toHabitantId), amount: money(payment.amountCents) })}
              </li>
            ))}
            {netting.steps.map((step) => (
              <li key={`${step.kind}-${step.habitantId}`}>{stepText(step, true)}</li>
            ))}
          </ul>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <h4 className="font-semibold">{t("settlement.title")}</h4>
      <ul className="flex flex-col gap-1">
        {settlement.steps.map((step) => (
          <li key={`${step.kind}-${step.habitantId}`} className="break-words">
            {stepText(step)}
          </li>
        ))}
      </ul>
      {nettingNode && (
        <div className="flex flex-col gap-2 text-muted-foreground">
          {nettingNode}
          {canManage &&
            netting?.direct.map((payment) => (
              <ConfirmDialog
                key={`${payment.fromHabitantId}-${payment.toHabitantId}`}
                trigger={
                  <Button size="sm" variant="outline" className={cn(ACTION_BUTTON, "self-start")}>
                    <HandshakeIcon />
                    {t("actions.recordDirect")}
                  </Button>
                }
                title={t("settlement.directTitle", { from: personName(payment.fromHabitantId), to: personName(payment.toHabitantId), amount: money(payment.amountCents) })}
                description={t("settlement.directDescription", { from: personName(payment.fromHabitantId), to: personName(payment.toHabitantId), amount: money(payment.amountCents) })}
                confirmLabel={t("actions.recordDirect")}
                onConfirm={() => onDirect(payment)}
              />
            ))}
        </div>
      )}
      {endPeople && <p className="font-medium break-words">{t("settlement.endResult", { people: endPeople, total, account: accountLabel })}</p>}
    </div>
  );
}
