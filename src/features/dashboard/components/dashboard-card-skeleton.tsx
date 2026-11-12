import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle } from "@/components/shared/card";
import { IconChip, type IconChipTone } from "@/components/shared/icon-chip";

type DashboardCardSkeletonProps = {
  /** The card's real title, so the layout doesn't change when the content arrives. */
  title: string;
  icon?: LucideIcon;
  tone?: IconChipTone;
  rows?: number;
};

/** A dashboard card whose content is still loading: real title, rows of skeleton lines. */
export function DashboardCardSkeleton({ title, icon, tone = "neutral", rows = 4 }: DashboardCardSkeletonProps) {
  const { t } = useTranslation();
  return (
    <Card aria-busy="true">
      <CardHeader className="items-center justify-start gap-3">
        {icon && <IconChip icon={icon} tone={tone} size="sm" />}
        <CardTitle>{title}</CardTitle>
        <span className="sr-only" role="status">
          {t("loading.default")}
        </span>
      </CardHeader>
      <Stack gap="3" aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <Inline gap="md" align="center" key={index}>
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Stack gap="1.5" className="flex-1">
              <Skeleton className="h-4" style={{ width: `${75 - ((index * 17) % 35)}%` }} />
              <Skeleton className="h-3 w-1/3" />
            </Stack>
          </Inline>
        ))}
      </Stack>
    </Card>
  );
}
