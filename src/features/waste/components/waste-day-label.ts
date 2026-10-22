import { useTranslation } from "react-i18next";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { addDays } from "@/types/dates";
import { wasteTiming } from "../types/waste";

/** "Today" / "Tomorrow" / "Tue 06/10/2026" for a collection day. */
export function useWasteDayLabel(today: string) {
  const { t } = useTranslation("waste");
  const tomorrow = addDays(today, 1);
  const locale = currentLocale();
  return (date: string) => {
    const timing = wasteTiming(date, today, tomorrow);
    return timing === "later" ? formatDate(date, locale, { weekday: "short" }) : t(`days.${timing}`);
  };
}
