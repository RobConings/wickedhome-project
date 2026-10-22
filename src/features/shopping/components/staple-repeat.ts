import type { TFunction } from "i18next";

/** Repeat choices offered for staples; the key is the translation under `shopping:repeat`. */
export const STAPLE_REPEAT_OPTIONS = [
  { rrule: "FREQ=WEEKLY", key: "weekly" },
  { rrule: "FREQ=WEEKLY;INTERVAL=2", key: "biweekly" },
  { rrule: "FREQ=MONTHLY", key: "monthly" },
  { rrule: "FREQ=DAILY", key: "daily" },
] as const;

/** "Every week", "Every 2 weeks"… or the raw rule for anything else. */
export function describeStapleRepeat(rrule: string, t: TFunction<"shopping">): string {
  const option = STAPLE_REPEAT_OPTIONS.find((candidate) => candidate.rrule === rrule);
  return option ? t(`repeat.${option.key}`) : t("repeat.custom", { rule: rrule });
}
