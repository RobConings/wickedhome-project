import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import { totalOpenPaidPercent, type TotalOpenProgress } from "../types/total-open";

type TotalOpenProgressBarProps = {
  progress: TotalOpenProgress;
  /** `compact`: one line under a list row; `full`: the detail page, with the last payment's amount. */
  variant?: "compact" | "full";
  className?: string;
};

/** "€ 4.265,85 of € 10.000,00 left · 5 payments to go · last on 01/03/2027" with a bar of what is paid off. */
export function TotalOpenProgressBar({ progress, variant = "compact", className }: TotalOpenProgressBarProps) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const percent = totalOpenPaidPercent(progress);
  const paidOff = progress.remainingCents === 0;
  const date = (value: string) => formatDate(value, locale);
  const parts = paidOff
    ? [t("totalOpen.paidOff")]
    : [
        t("totalOpen.left", { remaining: formatCurrency(progress.remainingCents, locale), total: formatCurrency(progress.totalCents, locale) }),
        ...(progress.paymentsLeft > 0 ? [t("totalOpen.paymentsToGo", { count: progress.paymentsLeft })] : []),
        ...(progress.lastDate ? [t("totalOpen.lastPayment", { date: date(progress.lastDate) })] : []),
      ];

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Progress value={percent} label={t("totalOpen.progressLabel", { percent })} className={variant === "compact" ? "h-1.5" : undefined} />
      <p className={cn("text-muted-foreground tabular-nums", variant === "compact" ? "text-xs" : "text-sm")}>{parts.join(" · ")}</p>
      {variant === "full" && !paidOff && progress.lastAmountCents !== null && progress.paymentsLeft > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("totalOpen.since", { date: date(progress.asOf), paid: formatCurrency(progress.paidCents, locale) })}
          {" · "}
          {t("totalOpen.lastAmount", { amount: formatCurrency(progress.lastAmountCents, locale) })}
        </p>
      )}
    </div>
  );
}
