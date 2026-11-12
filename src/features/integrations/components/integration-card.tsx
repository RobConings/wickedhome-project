import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
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
      <Stack gap="3" className="sm:flex-row sm:items-start sm:justify-between">
        <Inline gap="md" align="start" className="min-w-0">
          <IconChip icon={icon} tone={STATUS_TONE[status]} />
          <Stack gap="xs" className="min-w-0">
            <Inline gap="sm" align="center" wrap>
              <h2 className="text-base font-semibold">{title}</h2>
              <Badge variant={STATUS_BADGE[status]} className="max-w-full truncate">
                {statusLabel ?? t(`status.${status}`)}
              </Badge>
            </Inline>
            <Text size="sm" tone="muted" className="text-pretty">{description}</Text>
          </Stack>
        </Inline>
        {actions && <Inline gap="sm" align="stretch" wrap className="shrink-0">{actions}</Inline>}
      </Stack>
      {children}
    </Card>
  );
}

/** Placeholder while a card's data loads (a deferred loader promise). */
export function IntegrationCardSkeleton({ icon, title }: { icon: LucideIcon; title: string }) {
  const { t } = useTranslation("integrations");
  return (
    <Card className="gap-4" aria-busy="true" aria-label={t("loading.card", { name: title })}>
      <Inline gap="md" align="start">
        <IconChip icon={icon} tone="neutral" />
        <Stack gap="xs">
          <h2 className="text-base font-semibold">{title}</h2>
        </Stack>
      </Inline>
      <SkeletonList rows={2} />
    </Card>
  );
}
