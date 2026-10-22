import * as React from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { Project } from "../types/projects";

/** Money, dates and period labels for projects, in the current language (Belgian formats). */
export function useProjectText() {
  const { t } = useTranslation("projects");
  const locale = currentLocale();
  return React.useMemo(() => {
    const money = (cents: number) => formatCurrency(cents, locale);
    const date = (value: string) => formatDate(value, locale);
    const period = (project: Pick<Project, "startDate" | "endDate">) => {
      if (project.startDate && project.endDate) return t("dates.range", { from: date(project.startDate), to: date(project.endDate) });
      if (project.startDate) return t("dates.from", { date: date(project.startDate) });
      if (project.endDate) return t("dates.until", { date: date(project.endDate) });
      return null;
    };
    return { money, date, period };
  }, [locale, t]);
}
