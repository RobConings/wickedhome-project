import { WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardTitle } from "@/components/shared/card";
import { RecordLink } from "@/components/shared/record-link";
import { IconChip } from "@/components/shared/icon-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAsyncResource } from "@/lib/use-async-resource";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { fetchExpenseAccountEffect } from "../data/money-requests";
import type { ExpenseAccountEffect } from "../types/money";

/** Money owns the account projection; an expense composes the resulting source link. */
export function ExpenseAccountPanel({ expenseId, initial }: { expenseId: string; initial?: ExpenseAccountEffect }) {
  const { t } = useTranslation("money");
  const resource = useAsyncResource(`expense-account:${expenseId}`, () => fetchExpenseAccountEffect(expenseId), { initial });
  return <Card>
    <div className="flex items-center gap-2"><IconChip icon={WalletIcon} tone="finance" size="sm" /><CardTitle>{t("expenseEffect.title")}</CardTitle></div>
    {resource.error ? <div role="alert"><p className="text-sm text-muted-foreground">{t("expenseEffect.failed")}</p><Button onClick={resource.refresh} variant="outline">{t("expenseEffect.retry")}</Button></div>
      : !resource.data ? <Skeleton role="status" aria-label={t("expenseEffect.loading")} className="h-20" />
      : <><p className="text-sm text-muted-foreground">{t(`expenseEffect.${resource.data.status}`)}</p>
        {resource.data.amountCents !== null && <p className="text-xl font-semibold tabular-nums">{formatCurrency(resource.data.amountCents, currentLocale())}</p>}
        {resource.data.account && resource.data.month && <RecordLink className="flex min-h-11 items-center break-words font-medium underline" to={`/money?tab=history&account=${encodeURIComponent(resource.data.account.id)}&month=${resource.data.month}`}>{resource.data.account.name}</RecordLink>}
      </>}
  </Card>;
}
