import * as React from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { JOINT, type IncomeSource, type IncomeTargetAccount } from "../types/income";
import { IncomeSourceFormDialog } from "./income-source-form-dialog";
import { useRecurrenceText, useWhoName } from "./use-income-text";
import { dateText, money } from "@/lib/locale-text";

type IncomeSourceListProps = {
  sources: IncomeSource[];
  habitants: Habitant[];
  accounts: IncomeTargetAccount[];
  today: string;
  canManage: boolean;
};

function IncomeSourceRow({ source, habitants, accounts, today, canManage }: Omit<IncomeSourceListProps, "sources"> & { source: IncomeSource }) {
  const { t } = useTranslation("income");
  const recurrence = useRecurrenceText();
  const fetcher = useFetcher();
  const [editing, setEditing] = React.useState(false);
  const account = accounts.find((item) => item.id === source.targetAccountId);

  const amountText =
    source.amountMode === "fixed"
      ? source.currentAmountCents !== null && source.currentAmountFrom
        ? t("sources.amountFrom", { date: dateText(source.currentAmountFrom), amount: money(source.currentAmountCents) })
        : "—"
      : source.estimateCents !== null
        ? `${t("sources.variable")} · ${t("sources.estimate", { amount: money(source.estimateCents) })}`
        : t("sources.variable");
  const schedule = [
    recurrence(source.rrule),
    source.active ? (source.nextDate ? t("sources.next", { date: dateText(source.nextDate) }) : null) : source.endDate && t("sources.ended", { date: dateText(source.endDate) }),
    account ? t("sources.toAccount", { account: account.name }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{source.name}</span>
          <Badge variant="outline">{t(`kinds.${source.kind}`)}</Badge>
        </span>
        <span className="truncate text-xs text-muted-foreground">{amountText}</span>
        <span className="truncate text-xs text-muted-foreground">{schedule}</span>
      </span>
      {source.monthlyCents !== null && (
        <span className="hidden text-sm font-semibold tabular-nums sm:inline">{t("sources.perMonth", { amount: money(source.monthlyCents) })}</span>
      )}
      {canManage && (
        <span className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" aria-label={t("actions.edit")} onClick={() => setEditing(true)}>
            <PencilIcon />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label={t("actions.delete")}>
                <Trash2Icon />
              </Button>
            }
            title={t("form.deleteSourceTitle", { name: source.name })}
            description={t("form.deleteSourceDescription")}
            confirmLabel={t("actions.delete")}
            destructive
            onConfirm={() => fetcher.submit({ intent: "delete-source", id: source.id }, { method: "post" })}
          />
        </span>
      )}
      {editing && (
        <IncomeSourceFormDialog
          open
          onOpenChange={(open) => !open && setEditing(false)}
          source={source}
          habitants={habitants}
          accounts={accounts}
          today={today}
        />
      )}
    </li>
  );
}

/** Recurring incomes grouped per person (joint last), with their current amount and schedule. */
export function IncomeSourceList({ sources, habitants, accounts, today, canManage }: IncomeSourceListProps) {
  const whoName = useWhoName(habitants);
  const keys = [...habitants.map((habitant) => habitant.id), JOINT];
  const groups = keys
    .map((key) => ({ key, sources: sources.filter((source) => (source.habitantId ?? JOINT) === key) }))
    .filter((group) => group.sources.length > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => {
        const habitant = habitants.find((item) => item.id === group.key);
        return (
          <Card key={group.key} className="gap-2">
            <div className="flex items-center gap-2">
              {habitant && <HabitantAvatar habitant={habitant} size="sm" />}
              <h3 className="text-sm font-semibold">{whoName(group.key)}</h3>
            </div>
            <ul className="flex flex-col divide-y">
              {group.sources.map((source) => (
                <IncomeSourceRow key={source.id} source={source} habitants={habitants} accounts={accounts} today={today} canManage={canManage} />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
