import { LandmarkIcon, PiggyBankIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Habitant } from "@/features/household";
import { AccountFormDialog } from "./account-form-dialog";

type AddAccountCardProps = {
  kind: "joint" | "savings";
  habitants: Habitant[];
  today: string;
};

/**
 * A dashed placeholder in the row of account cards ("Add savings account"): opens the account form. It sits
 * where the missing account will appear instead of a lonely button above the page.
 */
export function AddAccountCard({ kind, habitants, today }: AddAccountCardProps) {
  const { t } = useTranslation("money");
  const Icon = kind === "savings" ? PiggyBankIcon : LandmarkIcon;
  return (
    <AccountFormDialog
      habitants={habitants}
      today={today}
      defaultKind={kind}
      trigger={
        <button
          type="button"
          className="flex h-full min-h-32 w-full min-w-0 flex-col items-start gap-2 rounded-xl border-2 border-dashed p-5 text-left text-muted-foreground transition-colors outline-none hover:border-section-border hover:bg-section-soft/50 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
              <Icon className="size-5 text-section" aria-hidden="true" />
            </span>
            <PlusIcon className="size-4" aria-hidden="true" />
            {kind === "savings" ? t("actions.addSavings") : t("actions.addJoint")}
          </span>
          <span className="text-sm">{kind === "savings" ? t("accounts.addSavingsDescription") : t("accounts.addJointDescription")}</span>
        </button>
      }
    />
  );
}
