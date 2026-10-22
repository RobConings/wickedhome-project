import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";

/** Placeholder shaped like `HouseStatusCard`, for its Suspense fallback while `fetchHouseStatus()` loads. */
export function HouseStatusCardSkeleton({ className }: { className?: string }) {
  const { t } = useTranslation("devices");
  return (
    <Card className={cn("gap-4", className)} aria-busy="true" aria-label={t("houseStatus.loading")}>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div aria-hidden className="flex flex-col gap-2">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center justify-between gap-2">
            <Skeleton className="h-4" style={{ width: `${45 - index * 10}%` }} />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-3 sm:gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-4" />
        ))}
      </div>
      <span className="sr-only">{t("houseStatus.loading")}</span>
    </Card>
  );
}
