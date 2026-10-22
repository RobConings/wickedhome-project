import * as React from "react";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  HistoryIcon,
  ReceiptIcon,
  ScaleIcon,
  Trash2Icon,
  Undo2Icon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "./card";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { GeneralList } from "./general-list";
import type { Habitant } from "@/features/household";
import type { FormResult } from "../lib/forms";
import { cn } from "@/lib/utils";
import type { JointAccount, LedgerLine, LedgerType } from "../types/money";
import { accountName, dateText, money, signedMoney, usePersonName } from "./use-money-text";

type LedgerListProps = {
  lines: LedgerLine[];
  accounts: JointAccount[];
  habitants: Habitant[];
  canManage: boolean;
  pending?: boolean;
  /** Stories: a stable key for the remembered list/tiles view. */
  storageKey?: string;
};

const ICONS: Record<LedgerType, LucideIcon> = {
  contribution: UserIcon,
  transfer: ArrowLeftRightIcon,
  income: BanknoteIcon,
  expense: ReceiptIcon,
  correction: ScaleIcon,
  other: ArrowUpRightIcon,
};

/** Title of a ledger line: "Contribution from Rob", "To Savings", "Correction: +€ 123,45 (set to € 8.000,00)". */
function useLineTitle(accounts: JointAccount[], habitants: Habitant[]) {
  const { t } = useTranslation("money");
  const personName = usePersonName(habitants);
  return (line: LedgerLine): string => {
    switch (line.type) {
      case "correction":
        return t("ledger.correction", { difference: signedMoney(line.amountCents), amount: money(line.setBalanceCents ?? 0) });
      case "contribution":
        if (!line.habitantId) return t("ledger.contributionUnknown");
        // A direct payment between two people (netting) and a take-back are contributions too, shown as what they are.
        if (line.counterpartHabitantId) {
          return line.amountCents >= 0
            ? t("ledger.directPaid", { name: personName(line.habitantId), other: personName(line.counterpartHabitantId) })
            : t("ledger.directReceived", { name: personName(line.habitantId), other: personName(line.counterpartHabitantId) });
        }
        return line.amountCents < 0 ? t("ledger.takenBack", { name: personName(line.habitantId) }) : t("ledger.contribution", { name: personName(line.habitantId) });
      case "transfer":
        if (!line.counterpartAccountId) return t("ledger.transferOther");
        return line.amountCents >= 0
          ? t("ledger.transferFrom", { account: accountName(accounts, line.counterpartAccountId) })
          : t("ledger.transferTo", { account: accountName(accounts, line.counterpartAccountId) });
      case "expense":
        return line.label ?? t("ledger.expense");
      case "income":
        return line.label ?? line.note ?? t("ledger.income");
      default:
        return line.note ?? (line.amountCents >= 0 ? t("ledger.otherIn") : t("ledger.other"));
    }
  };
}

function LineRow({ line, title, canManage }: { line: LedgerLine; title: string; canManage: boolean }) {
  const { t } = useTranslation("money");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<FormResult>();
  const Icon =
    line.type === "other" && line.amountCents >= 0
      ? ArrowDownLeftIcon
      : line.type === "contribution" && line.amountCents < 0 && !line.counterpartHabitantId
        ? Undo2Icon
        : ICONS[line.type];
  const correction = line.type === "correction";

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  const details = [
    dateText(line.date),
    line.type === "expense" || line.type === "income" ? t(`ledger.${line.type}`) : null,
    line.note && line.type !== "other" && line.type !== "income" ? line.note : null,
    t("ledger.balanceAfter", { amount: money(line.balanceAfterCents) }),
  ]
    .filter(Boolean)
    .join(" · ");

  const titleNode =
    line.source === "expense" ? (
      <Link to={`/expenses/${line.sourceId}`} className="truncate text-sm font-medium hover:text-primary hover:underline">
        {title}
      </Link>
    ) : (
      <span className="truncate text-sm font-medium">{title}</span>
    );

  return (
    <div className={cn("flex min-h-12 items-center gap-3", correction && "-mx-2 rounded-lg bg-warning/10 px-2 py-1", line.future && "opacity-70")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-muted", correction && "bg-warning/20 text-warning")}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          {titleNode}
          {correction && <Badge variant="outline">{t("ledger.correctionBadge")}</Badge>}
          {line.future && <Badge variant="outline">{t("ledger.future")}</Badge>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{details}</span>
      </span>
      {!correction && (
        <span className={cn("text-sm font-semibold tabular-nums", line.amountCents >= 0 ? "text-success" : "text-foreground")}>
          {signedMoney(line.amountCents)}
        </span>
      )}
      {canManage && line.source === "entry" && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={t("actions.deleteEntry")}>
              <Trash2Icon />
            </Button>
          }
          title={t("ledger.deleteTitle")}
          description={t("ledger.deleteDescription")}
          confirmLabel={t("actions.deleteEntry")}
          cancelLabel={tCommon("actions.cancel")}
          destructive
          onConfirm={() => fetcher.submit({ intent: "delete-entry", id: line.sourceId }, { method: "post" })}
        />
      )}
    </div>
  );
}

/**
 * An account's history for the month, newest first: contributions, transfers, paid joint expenses, incomes
 * and corrections (marked, with the difference and the balance they set), each with the balance after it.
 */
export function LedgerList({ lines, accounts, habitants, canManage, pending, storageKey = "money-ledger" }: LedgerListProps) {
  const { t } = useTranslation("money");
  const title = useLineTitle(accounts, habitants);
  return (
    <GeneralList
      label={t("ledger.label")}
      items={lines}
      getKey={(line) => line.key}
      renderRow={(line) => <LineRow line={line} title={title(line)} canManage={canManage} />}
      renderTile={(line) => (
        <Card className={cn("h-full gap-1", line.type === "correction" && "border-warning/40")}>
          <span className="text-xs text-muted-foreground">{dateText(line.date)}</span>
          <span className="text-sm font-medium">{title(line)}</span>
          {line.type !== "correction" && <span className="text-lg font-semibold tabular-nums">{signedMoney(line.amountCents)}</span>}
          <span className="text-xs text-muted-foreground">{t("ledger.balanceAfter", { amount: money(line.balanceAfterCents) })}</span>
        </Card>
      )}
      search={{ placeholder: t("ledger.searchPlaceholder"), keys: (line) => [title(line), line.note, line.label] }}
      storageKey={storageKey}
      pending={pending}
      emptyState={<EmptyState icon={HistoryIcon} title={t("ledger.empty")} />}
    />
  );
}
