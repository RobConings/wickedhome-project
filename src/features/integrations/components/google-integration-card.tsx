import * as React from "react";
import { CalendarDaysIcon, FolderIcon, MailIcon, PlugIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRevalidator, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { InlineAlert } from "@/components/shared/inline-alert";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { googleClient, type GoogleClient } from "../data/google-client";
import { GOOGLE_RETURN_PARAM, type GoogleFeature, type GoogleStatus } from "../types/google";
import type { IntegrationSetupStep } from "../types/integrations";
import { IntegrationCard, IntegrationCardSkeleton } from "./integration-card";
import { IntegrationSetupSteps } from "./integration-setup-steps";
import { GoogleCalendarPanel } from "./google-calendar-panel";
import { GoogleDrivePanel } from "./google-drive-panel";
import { GoogleMailPanel } from "./google-mail-panel";

type GoogleIntegrationCardProps = {
  /** From the route's loader: the status, a deferred promise of it (skeleton), or `null` (failed: Retry). */
  data: GoogleStatus | null | Promise<GoogleStatus | null>;
  /** API access; stories pass a fake. */
  client?: GoogleClient;
  /** Owners and adults; children only get Calendar (bills and Drive links end up with the adults). */
  allFeatures?: boolean;
};

/** The features someone switches on from the card, in this order. Publishing is switched on in the calendar panel. */
const CARD_FEATURES: { feature: GoogleFeature; icon: LucideIcon }[] = [
  { feature: "calendar", icon: CalendarDaysIcon },
  { feature: "gmail", icon: MailIcon },
  { feature: "drive", icon: FolderIcon },
];

function Deferred({ promise, client, allFeatures }: { promise: Promise<GoogleStatus | null>; client: GoogleClient; allFeatures: boolean }) {
  return <GooglePanel initial={React.use(promise)} client={client} allFeatures={allFeatures} />;
}

/**
 * Google, connected per person: status, connect (asking Google only for the chosen features), turn on more
 * features later (incremental consent), disconnect (revokes the consent at Google). When the server has no
 * Google credentials yet it shows the owner's setup steps instead.
 */
export function GoogleIntegrationCard({ data, client = googleClient, allFeatures = true }: GoogleIntegrationCardProps) {
  const { t } = useTranslation("integrations");
  if (data instanceof Promise) {
    return (
      <React.Suspense fallback={<IntegrationCardSkeleton icon={PlugIcon} title={t("google.title")} />}>
        <Deferred promise={data} client={client} allFeatures={allFeatures} />
      </React.Suspense>
    );
  }
  return <GooglePanel initial={data} client={client} allFeatures={allFeatures} />;
}

function setupSteps(status: GoogleStatus, t: (key: string, options?: Record<string, unknown>) => string): IntegrationSetupStep[] {
  const steps: IntegrationSetupStep[] = [];
  if (status.missing.includes("INTEGRATIONS_KEY")) {
    steps.push({ kind: "command", command: "openssl rand -base64 32", hint: t("google.setup.key") });
    steps.push({ kind: "env", name: "INTEGRATIONS_KEY", hint: t("google.setup.keyEnv") });
  }
  if (status.missing.includes("GOOGLE_CLIENT_ID") || status.missing.includes("GOOGLE_CLIENT_SECRET")) {
    steps.push({ kind: "text", text: t("google.setup.project") });
    steps.push({ kind: "text", text: t("google.setup.consent") });
    steps.push({ kind: "text", text: t("google.setup.client", { uri: status.redirectUri }) });
    steps.push({ kind: "env", name: "GOOGLE_CLIENT_ID" });
    steps.push({ kind: "env", name: "GOOGLE_CLIENT_SECRET" });
  }
  steps.push({ kind: "command", command: "pm2 restart wickedhome", hint: t("google.setup.restart") });
  return steps;
}

function GooglePanel({ initial, client, allFeatures }: { initial: GoogleStatus | null; client: GoogleClient; allFeatures: boolean }) {
  const { t } = useTranslation("integrations");
  const { t: tCommon } = useTranslation();
  const [status, setStatus] = React.useState(initial);
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const returned = searchParams.get(GOOGLE_RETURN_PARAM);
  const [busy, setBusy] = React.useState<GoogleFeature[] | "finish" | "reload" | null>(() => (returned === "finish" ? "finish" : null));

  // Back from Google's consent screen: finish the connection (the session cookie is only sent from here).
  const handledReturn = React.useRef(false);
  React.useEffect(() => {
    if (!returned || handledReturn.current) return;
    handledReturn.current = true;
    setSearchParams(
      (current) => {
        current.delete(GOOGLE_RETURN_PARAM);
        return current;
      },
      { replace: true, preventScrollReset: true },
    );
    if (returned !== "finish") {
      toast.error(t(`google.return.${returned === "denied" || returned === "expired" ? returned : "error"}`));
      return;
    }
    client
      .finish()
      .then((next) => {
        setStatus(next);
        toast.success(t("google.return.connected", { email: next.connection?.email ?? "" }));
        // Other cards on the page depend on the granted scopes too (bill documents in Drive).
        void revalidator.revalidate();
      })
      .catch(() => toast.error(t("google.return.error")))
      .finally(() => setBusy(null));
  }, [returned, client, setSearchParams, t, revalidator]);

  const reload = () => {
    setBusy("reload");
    client
      .status()
      .then(setStatus)
      .catch(() => toast.error(tCommon("errors.generic")))
      .finally(() => setBusy(null));
  };

  if (!status) {
    return (
      <IntegrationCard icon={PlugIcon} title={t("google.title")} description={t("google.description")} status="error">
        <ErrorState
          title={t("google.loadError")}
          action={
            <Button variant="outline" onClick={reload} loading={busy === "reload"}>
              {tCommon("actions.retry")}
            </Button>
          }
          className="py-6"
        />
      </IntegrationCard>
    );
  }

  const connect = (features: GoogleFeature[]) => {
    setBusy(features);
    client
      .start(features)
      .then(({ url }) => window.location.assign(url))
      .catch(() => {
        toast.error(t("google.connectFailed"));
        setBusy(null);
      });
  };

  const connection = status.connection;
  const wrongOrigin = typeof window !== "undefined" && window.location.origin !== status.connectOrigin;
  const granted = new Set(connection?.features ?? []);
  const featureBusy = (feature: GoogleFeature) => Array.isArray(busy) && busy.includes(feature);

  if (status.status === "not_configured") {
    return (
      <IntegrationCard icon={PlugIcon} title={t("google.title")} description={t("google.description")} status="not_configured">
        <IntegrationSetupSteps intro={t("google.setup.intro")} steps={setupSteps(status, t)} outro={t("google.setup.outro")} />
      </IntegrationCard>
    );
  }

  const statusLabel =
    connection?.status === "connected"
      ? t("google.connectedAs", { email: connection.email })
      : connection
        ? t("google.needsReconnect")
        : undefined;

  return (
    <IntegrationCard
      icon={PlugIcon}
      title={t("google.title")}
      description={t("google.description")}
      status={status.status}
      statusLabel={statusLabel}
      actions={
        connection && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                {t("google.disconnect")}
              </Button>
            }
            title={t("google.disconnectConfirm.title")}
            description={
              status.drive?.storedFileCount
                ? `${t("google.disconnectConfirm.description")} ${t("google.disconnectConfirm.driveFiles", { count: status.drive.storedFileCount })}`
                : t("google.disconnectConfirm.description")
            }
            confirmLabel={t("google.disconnect")}
            cancelLabel={tCommon("actions.cancel")}
            destructive
            onConfirm={() =>
              client
                .disconnect()
                .then((next) => {
                  setStatus(next);
                  toast.success(t("google.disconnected"));
                })
                .catch(() => toast.error(tCommon("errors.generic")))
            }
          />
        )
      }
    >
      {busy === "finish" && <InlineAlert>{t("google.finishing")}</InlineAlert>}
      {wrongOrigin && (
        <InlineAlert>
          {t("google.wrongOrigin")}{" "}
          <a className="font-medium underline underline-offset-4" href={`${status.connectOrigin}/integrations`}>
            {status.connectOrigin.replace(/^https?:\/\//, "")}
          </a>
        </InlineAlert>
      )}
      {connection?.status === "needs_reconnect" && (
        <InlineAlert tone="error">
          <span className="flex flex-col gap-2">
            <span>{t("google.reconnectHint")}</span>
            <Button size="sm" className="w-fit" onClick={() => connect(connection.features.length ? connection.features : ["calendar"])} loading={Array.isArray(busy)} disabled={wrongOrigin}>
              {t("google.reconnect")}
            </Button>
          </span>
        </InlineAlert>
      )}
      {connection && (
        <p className="text-xs text-muted-foreground">
          {t("google.connectedSince", { date: formatDate(connection.connectedAt, currentLocale()) })}
        </p>
      )}

      <ul className="flex flex-col divide-y rounded-lg border">
        {CARD_FEATURES.filter(({ feature }) => allFeatures || feature === "calendar").map(({ feature, icon: Icon }) => {
          const on = granted.has(feature);
          return (
            <li key={feature} className="flex flex-col gap-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{t(`google.features.${feature}.title`)}</span>
                    <span className="text-xs text-muted-foreground">{t(`google.features.${feature}.description`)}</span>
                  </div>
                </div>
                {!on && (
                  <Button size="sm" variant={connection ? "outline" : "default"} onClick={() => connect([feature])} loading={featureBusy(feature)} disabled={wrongOrigin || busy !== null}>
                    {connection ? t("google.turnOn") : t("google.connect")}
                  </Button>
                )}
              </div>
              {on && connection?.status === "connected" && feature === "calendar" && status.calendar && (
                <GoogleCalendarPanel settings={status.calendar} client={client} onStatus={setStatus} onConnect={connect} canPublish={granted.has("calendar_publish")} connectDisabled={wrongOrigin} />
              )}
              {on && connection?.status === "connected" && feature === "gmail" && status.gmail && (
                <GoogleMailPanel
                  settings={status.gmail}
                  client={client}
                  onStatus={setStatus}
                  canSend={granted.has("gmail_send")}
                  onConnect={connect}
                  connectDisabled={wrongOrigin || busy !== null}
                  connecting={featureBusy("gmail_send")}
                />
              )}
              {on && connection?.status === "connected" && feature === "drive" && status.drive && <GoogleDrivePanel settings={status.drive} />}
            </li>
          );
        })}
      </ul>
      {!connection && <p className="text-xs text-muted-foreground">{t("google.privacy")}</p>}
    </IntegrationCard>
  );
}
