import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ExpenseStatus, RecurringStatus } from "../types/expenses";

// Semantic badge variants (docs/BRANDING.md): due soon is orange, overdue red, paid green.
const STATUS_VARIANTS = {
  upcoming: "neutral",
  due: "soon",
  overdue: "danger",
  paid: "success",
} as const satisfies Record<ExpenseStatus, string>;

/** Upcoming / due soon / overdue / paid. */
export function ExpenseStatusBadge({ status, className }: { status: ExpenseStatus; className?: string }) {
  const { t } = useTranslation("expenses");
  return (
    <Badge variant={STATUS_VARIANTS[status]} className={className}>
      {t(`status.${status}`)}
    </Badge>
  );
}

const RECURRING_VARIANTS = {
  active: "success",
  paused: "warning",
  ended: "neutral",
} as const satisfies Record<RecurringStatus, string>;

/** Active / paused / ended, for recurring expenses. */
export function RecurringStatusBadge({ status, className }: { status: RecurringStatus; className?: string }) {
  const { t } = useTranslation("expenses");
  return (
    <Badge variant={RECURRING_VARIANTS[status]} className={className}>
      {t(`recurringStatus.${status}`)}
    </Badge>
  );
}
