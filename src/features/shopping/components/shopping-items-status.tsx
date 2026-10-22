import * as React from "react";
import { RotateCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/shared/loading-state";
import { cn } from "@/lib/utils";

/** Placeholder rows while an embedded shopping list loads its items for the first time. */
export function ShoppingItemsSkeleton({ rows = 2, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation("shopping");
  return (
    <div role="status" aria-label={t("loading.items")} className={cn("rounded-xl border bg-card px-3", className)}>
      <SkeletonList rows={rows} className="[&>div]:py-2" />
    </div>
  );
}

type ShoppingItemsErrorProps = {
  /** Loads the items again; the button spins until it settles. */
  onRetry: () => Promise<unknown>;
  className?: string;
};

/** The first load of an embedded shopping list failed: say so and offer to try again (instead of an endless skeleton). */
export function ShoppingItemsError({ onRetry, className }: ShoppingItemsErrorProps) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  const [retrying, setRetrying] = React.useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>{t("loading.itemsFailed")}</span>
      <Button type="button" variant="outline" size="sm" loading={retrying} onClick={() => void retry()}>
        <RotateCwIcon />
        {tCommon("actions.retry")}
      </Button>
    </div>
  );
}
