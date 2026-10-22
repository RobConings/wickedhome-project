import * as React from "react";
import { ArrowRightIcon, HousePlugIcon, PlugZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useLiveEvents } from "@/lib/live-events";
import { cn } from "@/lib/utils";
import { fetchHaStatus, testHaConnection } from "../data/home-assistant-requests";
import { HA_STATUS_EVENT, type HaConnectionStatus } from "../types/home-assistant";
import { formatDateTime, formatRelative } from "./ha-format";
import { HaSetupSteps } from "./ha-setup-steps";
import { HaStatusBadge } from "./ha-status-badge";

type HomeAssistantIntegrationCardProps = {
  /** Initial status (from a loader); without it the card loads it and shows a skeleton meanwhile. */
  status?: HaConnectionStatus | null;
  /** Owners and adults may test the connection. */
  canManage: boolean;
  /** Show the link to the Home Assistant page (off on that page itself). */
  showPageLink?: boolean;
  /** Live updates over Server-Sent Events (off in Storybook). */
  live?: boolean;
  /** Fixed clock for stories. */
  now?: number;
  className?: string;
};

/**
 * Home Assistant on the Integrations page: connection state, version, entity count and the last event; the
 * owner's setup steps while it isn't configured; "Test connection". Self-contained: compose it anywhere.
 */
export function HomeAssistantIntegrationCard({ status: initial, canManage, showPageLink = true, live = true, now, className }: HomeAssistantIntegrationCardProps) {
  const { t, i18n } = useTranslation("home-assistant");
  const [status, setStatus] = React.useState<HaConnectionStatus | null>(initial ?? null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const reload = React.useCallback(() => {
    fetchHaStatus().then(
      (next) => {
        setStatus(next);
        setLoadFailed(false);
      },
      () => setLoadFailed(true),
    );
  }, []);

  React.useEffect(() => {
    if (initial === undefined && live) reload();
  }, [initial, live, reload]);
  useLiveEvents<HaConnectionStatus>(HA_STATUS_EVENT, (next) => setStatus(next), { enabled: live });
  useLiveEvents("ready", () => reload(), { enabled: live });

  const test = async () => {
    setTesting(true);
    try {
      const result = await testHaConnection();
      if (result.ok) toast.success(t("card.testOk", { version: result.haVersion ?? "?", count: result.entityCount, ms: result.latencyMs ?? 0 }));
      else toast.error(result.errorCode ? t(`errors.${result.errorCode}`) : t("card.testFailed"));
      reload();
    } catch {
      toast.error(t("card.testFailed"));
    } finally {
      setTesting(false);
    }
  };

  const header = (
    <CardHeader>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
          <HousePlugIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle>{t("card.title")}</CardTitle>
          <CardDescription>{t("card.description")}</CardDescription>
        </div>
      </div>
      {status && <HaStatusBadge state={status.state} />}
    </CardHeader>
  );

  if (!status) {
    return (
      <Card className={className} aria-busy={!loadFailed}>
        {header}
        {loadFailed ? (
          <InlineAlert tone="error">{t("card.loadFailed")}</InlineAlert>
        ) : (
          <div className="flex flex-col gap-2" aria-label={t("card.loading")}>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-40" />
          </div>
        )}
      </Card>
    );
  }

  const notConfigured = status.state === "not_configured";
  return (
    <Card className={cn(status.state === "error" && "border-l-4 border-l-destructive", className)}>
      {header}

      {notConfigured ? (
        <div className="flex flex-col gap-3">
          {status.errorCode === "other_household" ? (
            <InlineAlert>{t("errors.other_household")}</InlineAlert>
          ) : (
            <>
              <p className="text-sm">{t("setup.intro")}</p>
              <HaSetupSteps />
            </>
          )}
        </div>
      ) : (
        <>
          {status.state === "error" && (
            <InlineAlert tone="error">
              <span className="flex flex-col gap-0.5">
                <span>{status.errorCode ? t(`errors.${status.errorCode}`) : t("errors.unreachable")}</span>
                {status.errorMessage && <span className="text-xs text-muted-foreground">{status.errorMessage}</span>}
                {status.nextRetryAt && <span className="text-xs text-muted-foreground">{t("card.nextRetry", { when: formatRelative(status.nextRetryAt, i18n.language, now) })}</span>}
              </span>
            </InlineAlert>
          )}
          <DescriptionList>
            <DescriptionItem label={t("card.url")} wide>
              <span className="font-mono text-xs break-all">{status.url ?? "—"}</span>
            </DescriptionItem>
            <DescriptionItem label={t("card.version")}>{status.haVersion ?? "—"}</DescriptionItem>
            <DescriptionItem label={t("card.entities")}>{status.state === "connected" ? status.entityCount : "—"}</DescriptionItem>
            <DescriptionItem label={t("card.connectedSince")}>{status.connectedAt ? formatDateTime(status.connectedAt, i18n.language) : "—"}</DescriptionItem>
            <DescriptionItem label={t("card.lastEvent")}>{status.lastEventAt ? formatRelative(status.lastEventAt, i18n.language, now) : "—"}</DescriptionItem>
          </DescriptionList>
        </>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {canManage && !notConfigured && (
          <Button variant="outline" onClick={() => void test()} loading={testing}>
            <PlugZapIcon />
            {testing ? t("card.testing") : t("card.test")}
          </Button>
        )}
        {showPageLink && !notConfigured && (
          <Button asChild variant="ghost" className="ml-auto">
            <Link to="/home-assistant">
              {t("card.open")}
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
