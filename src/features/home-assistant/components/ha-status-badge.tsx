import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { HaConnectionState } from "../types/home-assistant";

const VARIANTS = {
  connected: "success",
  connecting: "neutral",
  error: "danger",
  not_configured: "neutral",
} as const satisfies Record<HaConnectionState, string>;

/** Connected / connecting / error / not configured, as a small coloured badge. */
export function HaStatusBadge({ state, className }: { state: HaConnectionState; className?: string }) {
  const { t } = useTranslation("home-assistant");
  return (
    <Badge variant={VARIANTS[state]} className={className}>
      {state === "connecting" ? <Spinner className="size-3" /> : <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {t(`status.${state}`)}
    </Badge>
  );
}
