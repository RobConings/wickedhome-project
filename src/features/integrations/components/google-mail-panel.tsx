import * as React from "react";
import { Link } from "react-router";
import { MailSearchIcon, SendIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "./inline-alert";
import { currentLocale } from "@/lib/i18n";
import { formatDateTime } from "@/types/date-format";
import type { GoogleClient } from "../data/google-client";
import type { GoogleFeature, GoogleMailSettings, GoogleStatus } from "../types/google";
import { MailRulesDialog } from "./mail-rules-dialog";

type GoogleMailPanelProps = {
  settings: GoogleMailSettings;
  client: GoogleClient;
  onStatus: (status: GoogleStatus) => void;
  /** "Send mail from the assistant" (`gmail_send`) is granted. */
  canSend?: boolean;
  /** Asks Google for more features (incremental consent); absent: the send option isn't offered. */
  onConnect?: (features: GoogleFeature[]) => void;
  connectDisabled?: boolean;
  /** A consent round for these features is starting. */
  connecting?: boolean;
};

/**
 * Gmail: bill suggestions (when the mailbox was searched, how many wait on the Expenses page, "Search now", the
 * rules) and "Send mail from the assistant" (asked separately: Google's send and draft permission).
 */
export function GoogleMailPanel({ settings, client, onStatus, canSend = false, onConnect, connectDisabled = false, connecting = false }: GoogleMailPanelProps) {
  const { t } = useTranslation("integrations");
  const [scanning, setScanning] = React.useState(false);

  const scan = () => {
    setScanning(true);
    client
      .scanMail()
      .then((next) => {
        onStatus(next);
        toast.success(t("google.mail.scanned", { count: next.gmail?.pendingCount ?? 0 }));
      })
      .catch(() => toast.error(t("google.mail.scanFailed")))
      .finally(() => setScanning(false));
  };

  return (
    <div className="flex flex-col gap-3 pl-0 sm:pl-6">
      <p className="text-sm">
        {settings.pendingCount > 0 ? (
          <Link to="/expenses" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("google.mail.pending", { count: settings.pendingCount })}
          </Link>
        ) : (
          <span className="text-muted-foreground">{t("google.mail.nonePending")}</span>
        )}
      </p>
      {settings.lastError && <InlineAlert tone="error">{t("google.mail.failed", { error: settings.lastError })}</InlineAlert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={scan} loading={scanning}>
          <MailSearchIcon />
          {t("google.mail.scanNow")}
        </Button>
        <MailRulesDialog client={client} trigger={<Button size="sm" variant="ghost">{t("google.mail.rules")}</Button>} />
        <span className="text-xs text-muted-foreground">
          {settings.lastScanAt
            ? t("google.mail.lastScan", {
                time: formatDateTime(settings.lastScanAt, currentLocale()),
              })
            : t("google.mail.neverScanned")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("google.mail.privacy")}</p>
      {onConnect && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <SendIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{t("google.mail.send.title")}</span>
                <span className="text-xs text-muted-foreground">{canSend ? t("google.mail.send.on") : t("google.mail.send.description")}</span>
              </div>
            </div>
            {!canSend && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => onConnect(["gmail_send"])} loading={connecting} disabled={connectDisabled}>
                {t("google.mail.send.turnOn")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
