import { useTranslation } from "react-i18next";
import type { Habitant } from "@/features/household";
import type { JointAccount } from "../types/money";

/** Name of a habitant, or of the joint household for "joint". */
export function usePersonName(habitants: readonly Habitant[]) {
  const { t } = useTranslation("money");
  return (key: string | null | undefined): string =>
    habitants.find((habitant) => habitant.id === key)?.name ?? (key === "joint" ? t("kinds.joint") : "—");
}

/** Name of a joint account. */
export const accountName = (accounts: readonly JointAccount[], id: string | null | undefined) =>
  accounts.find((account) => account.id === id)?.name ?? "—";

/** People who can contribute or own an account (pets can't). */
export const people = (habitants: readonly Habitant[]) => habitants.filter((habitant) => habitant.type !== "pet");
