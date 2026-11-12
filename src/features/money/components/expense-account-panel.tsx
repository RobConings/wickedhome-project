import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
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
    <Inline gap="sm" align="center"><IconChip icon={WalletIcon} tone="finance" size="sm" /><CardTitle>{t("expenseEffect.title")}</CardTitle></Inline>
    {resource.error ? <div role="alert"><Text size="sm" tone="muted">{t("expenseEffect.failed")}</Text><Button onClick={resource.refresh} variant="outline">{t("expenseEffect.retry")}</Button></div>
      : !resource.data ? <Skeleton role="status" aria-label={t("expenseEffect.loading")} className="h-20" />
      : <><Text size="sm" tone="muted">{t(`expenseEffect.${resource.data.status}`)}</Text>
        {resource.data.amountCents !== null && <Text size="xl" weight="semibold" className="tabular-nums">{formatCurrency(resource.data.amountCents, currentLocale())}</Text>}
        {resource.data.account && resource.data.month && <RecordLink className="flex min-h-11 items-center break-words font-medium underline" to={`/money?tab=history&account=${encodeURIComponent(resource.data.account.id)}&month=${resource.data.month}`}>{resource.data.account.name}</RecordLink>}
      </>}
  </Card>;
}
