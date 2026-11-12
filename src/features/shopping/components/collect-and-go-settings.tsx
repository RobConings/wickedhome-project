import * as React from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { CollectAndGoStatus } from "../types/collect-and-go";

export function CollectAndGoSettings({ email, initial }: { email: string; initial?: CollectAndGoStatus }) {
  const { t } = useTranslation("shopping");
  const emailArgument = "'" + email.replaceAll("'", "'\"'\"'") + "'";
  const [status, setStatus] = React.useState<CollectAndGoStatus | null>(initial ?? null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => { if (initial) return; let active = true; void api.get<CollectAndGoStatus>("/shopping/collect-and-go/status").then((data) => { if (active) setStatus(data); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [initial]);
  return <section className="flex min-w-0 flex-col gap-4" aria-label="Collect&Go">
    <p className="text-sm text-muted-foreground">{t("collectAndGo.description")}</p>
    {error && <InlineAlert tone="error">{t("collectAndGo.error")}</InlineAlert>}
    {status && <p role="status" className="text-sm">{t(!status.enabled ? "collectAndGo.disabled" : status.connected ? "collectAndGo.imported" : "collectAndGo.notImported")}</p>}
    <ol className="list-decimal space-y-3 pl-5 text-sm">
      <li>{t("collectAndGo.serverSetup")}<pre className="mt-2 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs"><code>COLLECTANDGO_ENABLED=1{"\n"}npx playwright install chromium</code></pre></li>
      <li>{t("collectAndGo.desktopLogin")}<pre className="mt-2 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs"><code>npm run collectandgo:login</code></pre></li>
      <li>{t("collectAndGo.importInstructions")}<pre className="mt-2 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs"><code>npm run collectandgo:import -- --user {emailArgument} --file /protected/collect-and-go.json</code></pre></li>
    </ol>
    <p className="text-xs text-muted-foreground">{t("collectAndGo.challenge")}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => { setError(false); void api.get<CollectAndGoStatus>("/shopping/collect-and-go/status").then(setStatus).catch(() => setError(true)); }}>{t("collectAndGo.refresh")}</Button>
      {status?.connected && <ConfirmDialog trigger={<Button variant="outline">{t("collectAndGo.disconnect")}</Button>} title={t("collectAndGo.disconnect")} description={t("collectAndGo.disconnectDescription")} confirmLabel={t("collectAndGo.disconnect")} cancelLabel={t("common:actions.cancel")} destructive onConfirm={async () => { try { await api.delete("/shopping/collect-and-go/session"); setStatus({ ...status, connected: false, importedAt: null }); } catch { setError(true); } }} />}
      <a href="https://www.collectandgo.be/nl/home" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.open")}</a>
    </div>
  </section>;
}
