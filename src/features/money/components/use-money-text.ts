import { useTranslation } from "react-i18next";
import type { Habitant } from "@/features/household";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate, formatMonth } from "@/types/date-format";
import type { JointAccount } from "../types/money";

/** € 1.234,56 in the current language. */
export const money = (cents: number) => formatCurrency(cents, currentLocale());

/** "+€ 123,45" / "−€ 123,45": always with a sign. */
export const signedMoney = (cents: number) => `${cents < 0 ? "−" : "+"}${formatCurrency(Math.abs(cents), currentLocale())}`;

/** "12/10/2026" */
export const dateText = (date: string) => formatDate(date, currentLocale());

/** "oktober 2026" */
export const monthLabel = (month: string) => formatMonth(month, currentLocale());

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
