import { useTranslation } from "react-i18next";
import type { Habitant } from "@/features/household";
import { currentLocale } from "@/lib/i18n";
import { describeRecurrence } from "@/lib/recurrence-format";
import { JOINT } from "../types/income";

/** Name of who an income belongs to: the habitant, or "Joint". */
export function useWhoName(habitants: readonly Habitant[]) {
  const { t } = useTranslation("income");
  return (habitantId: string | null | undefined): string =>
    !habitantId || habitantId === JOINT ? t("who.joint") : (habitants.find((habitant) => habitant.id === habitantId)?.name ?? t("who.joint"));
}

/** Human text for an RRULE ("Every month"). */
export function useRecurrenceText() {
  const { t } = useTranslation("income");
  return (rrule: string): string | null => describeRecurrence(rrule, currentLocale(), t);
}

/** People who can have an income (pets can't). */
export const earners = (habitants: readonly Habitant[]) => habitants.filter((habitant) => habitant.type !== "pet");
