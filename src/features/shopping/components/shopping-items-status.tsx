import { useTranslation } from "react-i18next";
import { SkeletonList } from "@/components/shared/loading-state";
import { cn } from "@/lib/utils";
import { LoadFailedNotice } from "@/components/shared/inline-retry";

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
  return <LoadFailedNotice message={t("loading.itemsFailed")} onRetry={onRetry} className={className} />;
}
