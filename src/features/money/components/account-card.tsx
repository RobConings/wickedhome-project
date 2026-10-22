import * as React from "react";
import { ArrowLeftRightIcon, EllipsisVerticalIcon, LandmarkIcon, PiggyBankIcon, ScaleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/shared/card";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import type { AccountMonth, JointAccount } from "../types/money";
import { AccountFormDialog } from "./account-form-dialog";
import { OtherEntryDialog } from "./other-entry-dialog";
import { RecordTransferDialog } from "./record-transfer-dialog";
import { SetBalanceDialog } from "./set-balance-dialog";
import { dateText, money } from "@/lib/locale-text";
import { useCanManage } from "@/lib/permissions";

type AccountCardProps = {
  account: JointAccount;
  month?: AccountMonth;
  accounts: JointAccount[];
  habitants: Habitant[];
  today: string;
  /** Defaults to the nearest `CanManageProvider`. */
  canManage?: boolean;
};

/** A card action: grows to fill the row, wraps to its own row below ~11rem, and wraps its label if needed. */
const ACTION_BUTTON = "h-auto min-h-10 min-w-0 flex-1 basis-44 whitespace-normal py-2";

/** Groups an IBAN in fours: "BE68 5390 0754 7034". */
const groupIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

/**
 * One joint account: balance today, the latest correction, this month's in and out, and the actions
 * "Set real balance" and "Record transfer" (more: edit, other money in or out).
 */
export function AccountCard({ account, month, accounts, habitants, today, canManage: canManageProp }: AccountCardProps) {
  const canManage = useCanManage(canManageProp);
  const { t } = useTranslation("money");
  const [dialog, setDialog] = React.useState<"edit" | "other" | null>(null);
  const Icon = account.kind === "savings" ? PiggyBankIcon : LandmarkIcon;
  const owners = account.ownerIds.flatMap((id) => habitants.filter((habitant) => habitant.id === id));
  const close = (open: boolean) => !open && setDialog(null);

  return (
    <Card className={cn("h-full min-w-0 gap-3", account.archived && "opacity-60")}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: account.color }}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="font-semibold break-words">{account.name}</h3>
          <span className="truncate text-xs text-muted-foreground">
            {t(`kinds.${account.kind}`)}
            {account.iban ? ` · ${groupIban(account.iban)}` : ""}
          </span>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("actions.more")}>
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog("edit")}>{t("actions.editAccount")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("other")}>{t("actions.otherEntry")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{t("accounts.balance")}</span>
        <span className={cn("text-2xl font-semibold tabular-nums", account.balanceCents < 0 && "text-destructive")}>{money(account.balanceCents)}</span>
        {account.lastCorrection && (
          <span className="text-xs text-muted-foreground">
            {t("accounts.lastCorrection", { amount: money(account.lastCorrection.balanceCents), date: dateText(account.lastCorrection.date) })}
          </span>
        )}
      </div>

      {month && (month.inCents > 0 || month.outCents > 0 || month.plannedInCents > 0 || month.plannedOutCents > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{t("accounts.monthIn", { amount: money(month.inCents) })}</Badge>
          <Badge variant="secondary">{t("accounts.monthOut", { amount: money(month.outCents) })}</Badge>
          {/* Dated after today: not in the balance yet. */}
          {month.plannedInCents > 0 && <Badge variant="outline">{t("accounts.plannedIn", { amount: money(month.plannedInCents) })}</Badge>}
          {month.plannedOutCents > 0 && <Badge variant="outline">{t("accounts.plannedOut", { amount: money(month.plannedOutCents) })}</Badge>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {owners.length > 0 && (
          <span className="flex items-center" aria-label={`${t("accounts.owners")}: ${owners.map((owner) => owner.name).join(", ")}`}>
            {owners.map((owner) => (
              <HabitantAvatar key={owner.id} habitant={owner} size="sm" className="-ml-1.5 ring-2 ring-card first:ml-0" />
            ))}
          </span>
        )}
        {account.isDefault && <Badge variant="outline">{t("accounts.default")}</Badge>}
        {account.archived && <Badge variant="outline">{t("accounts.archived")}</Badge>}
      </div>

      {canManage && !account.archived && (
        // Side by side when the card is wide enough, else stacked full width; labels wrap instead of overflowing.
        <div className="mt-auto flex flex-wrap gap-2">
          <RecordTransferDialog
            accounts={accounts}
            habitants={habitants}
            today={today}
            defaults={{ toAccountId: account.id }}
            trigger={
              <Button variant="outline" className={ACTION_BUTTON}>
                <ArrowLeftRightIcon />
                {t("actions.recordTransfer")}
              </Button>
            }
          />
          <SetBalanceDialog
            account={account}
            today={today}
            trigger={
              <Button variant="outline" className={ACTION_BUTTON}>
                <ScaleIcon />
                {t("actions.setBalance")}
              </Button>
            }
          />
        </div>
      )}

      {dialog === "edit" && <AccountFormDialog open onOpenChange={close} account={account} habitants={habitants} today={today} />}
      {dialog === "other" && <OtherEntryDialog open onOpenChange={close} account={account} today={today} />}
    </Card>
  );
}
