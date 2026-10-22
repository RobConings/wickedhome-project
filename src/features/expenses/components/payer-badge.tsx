import { WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import type { ExpenseShare, PayerType } from "../types/expenses";

type PayerBadgeProps = {
  payer: { payerType: PayerType; payerHabitantId: string | null; shares: ExpenseShare[] };
  habitants: Habitant[];
  className?: string;
};

/** Who pays, compactly: a wallet for the joint account, the person's avatar, or the avatars of a split. */
export function PayerBadge({ payer, habitants, className }: PayerBadgeProps) {
  const { t } = useTranslation("expenses");
  const find = (id: string | null) => habitants.find((habitant) => habitant.id === id);

  if (payer.payerType === "joint") {
    return (
      <span
        role="img"
        aria-label={t("payer.joint")}
        title={t("payer.joint")}
        className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground", className)}
      >
        <WalletIcon className="size-3.5" aria-hidden="true" />
      </span>
    );
  }
  const people =
    payer.payerType === "person" ? [find(payer.payerHabitantId)] : payer.shares.map((share) => find(share.habitantId));
  const known = people.filter((habitant): habitant is Habitant => Boolean(habitant));
  if (known.length === 0) return null;
  const label =
    payer.payerType === "split" ? t("payer.splitBetween", { names: known.map((h) => h.name).join(", ") }) : (known[0]?.name ?? "");
  return (
    <span role="img" aria-label={label} title={label} className={cn("flex shrink-0 -space-x-1.5", className)}>
      {known.map((habitant) => (
        <HabitantAvatar key={habitant.id} habitant={habitant} size="sm" />
      ))}
    </span>
  );
}
