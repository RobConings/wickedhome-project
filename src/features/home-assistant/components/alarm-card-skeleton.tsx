import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/shared/card";

/** Shaped like the alarm card, while its data loads (Suspense fallback). */
export function AlarmCardSkeleton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation("home-assistant");
  return (
    <Card className={className} aria-busy="true" aria-label={t("alarm.loading")}>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <Skeleton className="h-4 w-40" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      {!compact && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
    </Card>
  );
}
