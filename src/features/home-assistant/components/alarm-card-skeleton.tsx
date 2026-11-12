import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/shared/card";

/** Shaped like the alarm card, while its data loads (Suspense fallback). */
export function AlarmCardSkeleton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation("home-assistant");
  return (
    <Card className={className} aria-busy="true" aria-label={t("alarm.loading")}>
      <Inline gap="sm" align="center" justify="between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </Inline>
      <Skeleton className="h-4 w-40" />
      <Inline gap="sm" align="stretch">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </Inline>
      {!compact && (
        <Stack gap="1.5" className="border-t pt-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </Stack>
      )}
    </Card>
  );
}
