import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { PageGrid } from "@/components/layout/page-grid";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";

/** Placeholder shaped like `HouseStatusCard`, for its Suspense fallback while `fetchHouseStatus()` loads. */
export function HouseStatusCardSkeleton({ className }: { className?: string }) {
  const { t } = useTranslation("devices");
  return (
    <Card className={cn("gap-4", className)} aria-busy="true" aria-label={t("houseStatus.loading")}>
      <Inline gap="sm" align="center" justify="between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </Inline>
      <Stack gap="sm" aria-hidden>
        {[0, 1].map((index) => (
          <Inline gap="sm" align="center" justify="between" key={index}>
            <Skeleton className="h-4" style={{ width: `${45 - index * 10}%` }} />
            <Skeleton className="h-5 w-20 rounded-full" />
          </Inline>
        ))}
      </Stack>
      <PageGrid gap="sm" aria-hidden className="border-t pt-3 sm:grid-cols-3 sm:gap-3">
        {[0, 1, 2].map((index) => (
          <Stack gap="1.5" key={index}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </Stack>
        ))}
      </PageGrid>
      <PageGrid gap="none" aria-hidden className="gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-4" />
        ))}
      </PageGrid>
      <span className="sr-only">{t("houseStatus.loading")}</span>
    </Card>
  );
}
