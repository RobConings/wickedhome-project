import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shared/card";
import { IconChip, type IconChipTone } from "@/components/shared/icon-chip";
import { SkeletonList } from "@/components/shared/loading-state";
import { cn } from "@/lib/utils";
import type { IntegrationStatus } from "../types/integrations";

const STATUS_TONE: Record<IntegrationStatus, IconChipTone> = {
  not_configured: "neutral",
  disconnected: "neutral",
  connected: "success",
  error: "danger",
};

const STATUS_BADGE: Record<IntegrationStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  not_configured: "outline",
  disconnected: "secondary",
  connected: "default",
  error: "destructive",
};

export type IntegrationCardProps = {
  icon: LucideIcon;
  title: string;
  /** What it brings, one or two lines. */
  description: string;
  status: IntegrationStatus;
  /** Replaces the status badge's text, e.g. "Connected as rob@gmail.com". */
  statusLabel?: string;
  /** Buttons in the header (Connect, Disconnect…). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * The frame every card on the Integrations page uses, so all integrations read the same: icon, name,
 * status badge, what it does, then the integration's own content (setup steps, settings, last sync).
 */
export function IntegrationCard({ icon, title, description, status, statusLabel, actions, children, className }: IntegrationCardProps) {
  const { t } = useTranslation("integrations");
  return (
    <Card className={cn("gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip icon={icon} tone={STATUS_TONE[status]} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{title}</h2>
              <Badge variant={STATUS_BADGE[status]} className="max-w-full truncate">
                {statusLabel ?? t(`status.${status}`)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">{description}</p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Placeholder while a card's data loads (a deferred loader promise). */
export function IntegrationCardSkeleton({ icon, title }: { icon: LucideIcon; title: string }) {
  const { t } = useTranslation("integrations");
  return (
    <Card className="gap-4" aria-busy="true" aria-label={t("loading.card", { name: title })}>
      <div className="flex items-start gap-3">
        <IconChip icon={icon} tone="neutral" />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
      </div>
      <SkeletonList rows={2} />
    </Card>
  );
}
