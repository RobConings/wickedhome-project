import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { collectAndGoStateSchema, type CollectAndGoState, type CollectAndGoStatus } from "../types/collect-and-go";
import { importCollectAndGoBrowserData } from "../types/collect-and-go-browser-import";

export function CollectAndGoSettings({ canImport = true, initial }: { canImport?: boolean; initial?: CollectAndGoStatus }) {
  const { t } = useTranslation("shopping");
  const [status, setStatus] = React.useState<CollectAndGoStatus | null>(initial ?? null);
  const [state, setState] = React.useState<CollectAndGoState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRead = React.useRef(0);
  React.useEffect(() => { if (initial) return; let active = true; void api.get<CollectAndGoStatus>("/shopping/collect-and-go/status").then((data) => { if (active) setStatus(data); }).catch(() => { if (active) setError("error"); }); return () => { active = false; }; }, [initial]);
  function paste(text: string) {
    ++fileRead.current; setState(null); setError(null);
    try { setState(importCollectAndGoBrowserData(text)); } catch { setError("browserInvalid"); }
  }
  return <section className="flex min-w-0 flex-col gap-4" aria-label="Collect&Go">
    <p className="text-sm text-muted-foreground">{t("collectAndGo.description")}</p>
    <Link to="/settings?section=xtra" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.xtraSeparate")}</Link>
    {error && <InlineAlert tone="error">{t(`collectAndGo.${error}`)}</InlineAlert>}
    {status && <p role="status" className="text-sm">{t(!status.enabled ? "collectAndGo.disabled" : status.connected ? "collectAndGo.importedUnverified" : "collectAndGo.notImported")}</p>}
    {status && !status.enabled && <InlineAlert>{t("collectAndGo.adminEnable")}</InlineAlert>}
    {canImport && <>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>{t("collectAndGo.browserSignIn")}</li>
        <li>{t("collectAndGo.browserNetwork")}</li>
        <li>{t("xtra.browserSensitive")}</li>
        <li>{t("collectAndGo.browserCopy")}</li>
      </ol>
      <label htmlFor="collectandgo-browser-data" className="text-sm font-medium">{t("xtra.browserData")}</label>
      <Textarea id="collectandgo-browser-data" value="" autoComplete="off" spellCheck={false} disabled={busy} placeholder={t("xtra.browserPlaceholder")} onPaste={(event) => { event.preventDefault(); paste(event.clipboardData.getData("text/plain")); }} onChange={(event) => { if (event.target.value) paste(event.target.value); }} />
      {state && <p role="status" className="text-sm text-primary">{t("collectAndGo.browserReady")}</p>}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("collectAndGo.existingFile")}</summary>
        <Input className="mt-3" type="file" accept=".json,application/json" aria-label={t("collectAndGo.existingFile")} disabled={busy} onChange={(event) => {
          const read = ++fileRead.current; setState(null); setError(null); const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 900000) { setError("browserInvalid"); return; }
          void file.text().then((text) => { const parsed = collectAndGoStateSchema.safeParse(JSON.parse(text)); if (!parsed.success || !parsed.data.cookies.some((cookie) => /(^|\.)collectandgo\.be$/.test(cookie.domain))) throw new Error("invalid"); if (read === fileRead.current) setState(parsed.data); }).catch(() => { if (read === fileRead.current) setError("browserInvalid"); });
        }} />
      </details>
      <Button type="button" disabled={busy || !state} onClick={() => {
        if (!state) return; setBusy(true); setError(null);
        void api.post<CollectAndGoStatus>("/shopping/collect-and-go/session", state).then((next) => { setStatus(next); setState(null); }).catch(() => setError("error")).finally(() => setBusy(false));
      }}>{t("collectAndGo.saveSession")}</Button>
      <p className="text-xs text-muted-foreground">{t("collectAndGo.browserPrivacy")}</p>
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(null); void api.get<CollectAndGoStatus>("/shopping/collect-and-go/status").then(setStatus).catch(() => setError("error")); }}>{t("collectAndGo.refresh")}</Button>
      {status?.connected && <ConfirmDialog trigger={<Button type="button" variant="outline" disabled={busy}>{t("collectAndGo.disconnect")}</Button>} title={t("collectAndGo.disconnect")} description={t("collectAndGo.disconnectDescription")} confirmLabel={t("collectAndGo.disconnect")} cancelLabel={t("common:actions.cancel")} destructive onConfirm={async () => { try { await api.delete("/shopping/collect-and-go/session"); setStatus({ ...status, connected: false, importedAt: null }); setState(null); } catch { setError("error"); } }} />}
      <a href="https://www.collectandgo.be/nl/home" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.open")}</a>
    </div>
  </section>;
}
