import { RadioIcon, WifiOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useLiveEventsStatus, type LiveEventsStatus } from "@/lib/live-events";
import { cn } from "@/lib/utils";

type LiveStatusBadgeProps = {
  /** Show this state instead of the real connection (stories). */
  status?: LiveEventsStatus;
  /** The page is reloading its data (after a reconnect or a change elsewhere). */
  refreshing?: boolean;
  className?: string;
};

/** The live connection at a glance: Live, Connecting…, Reconnecting… or Offline, and "Updating…" while reloading. */
export function LiveStatusBadge({ status: forced, refreshing = false, className }: LiveStatusBadgeProps) {
  const real = useLiveEventsStatus();
  return <LiveStatusBadgeView status={forced ?? real} refreshing={refreshing} className={className} />;
}

function LiveStatusBadgeView({ status, refreshing, className }: Required<Pick<LiveStatusBadgeProps, "status" | "refreshing">> & { className?: string }) {
  const { t } = useTranslation("devices");
  const open = status === "open";
  const offline = status === "offline";
  const busy = !open && !offline;
  const text = open ? (refreshing ? t("live.updating") : t("live.open")) : offline ? t("live.offline") : status === "reconnecting" ? t("live.reconnecting") : t("live.connecting");
  return (
    <Badge
      variant={offline ? "warning" : open ? "success" : "neutral"}
      role="status"
      title={offline ? t("live.offlineHint") : undefined}
      className={cn("gap-1.5 py-1", className)}
    >
      {busy || refreshing ? <Spinner className="size-3" /> : offline ? <WifiOffIcon /> : <RadioIcon className="text-success" />}
      {text}
    </Badge>
  );
}
