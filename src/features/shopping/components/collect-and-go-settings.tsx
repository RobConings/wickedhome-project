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

export function CollectAndGoSettings({ initial }: { initial?: CollectAndGoStatus }) {
  const { t } = useTranslation("shopping");
  const [status, setStatus] = React.useState<CollectAndGoStatus | null>(initial ?? null);
  const [userIds, setUserIds] = React.useState(initial?.members.filter((member) => member.allowed).map((member) => member.id) ?? []);
  const [state, setState] = React.useState<CollectAndGoState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRead = React.useRef(0);
  function accept(next: CollectAndGoStatus) { setStatus(next); setUserIds(next.members.filter((member) => member.allowed).map((member) => member.id)); }
  async function perform(work: () => Promise<CollectAndGoStatus>) { setBusy(true); setError(null); try { accept(await work()); } catch { setError("error"); } finally { setBusy(false); } }
  React.useEffect(() => { if (initial) return; let active = true; void api.get<CollectAndGoStatus>("/shopping/collect-and-go/status").then((data) => { if (active) { setStatus(data); setUserIds(data.members.filter((member) => member.allowed).map((member) => member.id)); } }).catch(() => { if (active) setError("error"); }); return () => { active = false; }; }, [initial]);
  function paste(text: string) {
    ++fileRead.current; setState(null); setError(null);
    try { setState(importCollectAndGoBrowserData(text)); } catch { setError("browserInvalid"); }
  }
  return <section className="flex min-w-0 flex-col gap-4" aria-label="Collect&Go">
    <p className="text-sm text-muted-foreground">{t("collectAndGo.description")}</p>
    <Link to="/settings?section=xtra" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.xtraSeparate")}</Link>
    {error && <InlineAlert tone="error">{t(`collectAndGo.${error}`)}</InlineAlert>}
    {status && <p role="status" className="text-sm">{t(!status.enabled ? "collectAndGo.disabled" : status.needsReconnect ? "collectAndGo.reconnect" : status.connected ? status.canUse ? "collectAndGo.importedUnverified" : "xtra.noAccess" : "collectAndGo.notImported")}</p>}
    {status && !status.enabled && <InlineAlert>{t("collectAndGo.adminEnable")}</InlineAlert>}
    {status?.canManage && <>
      {!status.configured && <InlineAlert>{t("xtra.notConfigured")}</InlineAlert>}
      <p className="text-sm text-muted-foreground">{t("collectAndGo.sharing")}</p>
      <fieldset disabled={busy || !status.configured} className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("xtra.accounts")}</legend>
        {status.members.map((member) => <label key={member.id} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={userIds.includes(member.id)} onChange={(event) => setUserIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span>{member.name}{member.role === "child" && <span className="ml-2 text-muted-foreground">{t("xtra.readOnly")}</span>}</span></label>)}
        {status.connected && <Button type="button" variant="outline" onClick={() => void perform(() => api.put<CollectAndGoStatus>("/shopping/collect-and-go/access", { userIds }))}>{t("xtra.saveAccess")}</Button>}
      </fieldset>
      {status.legacyAvailable && <InlineAlert><p>{t("collectAndGo.legacyHelp")}</p><Button className="mt-2" type="button" variant="outline" disabled={busy || !status.configured} onClick={() => void perform(async () => { const next = await api.post<CollectAndGoStatus>("/shopping/collect-and-go/session/adopt", { userIds }); setState(null); return next; })}>{t("collectAndGo.shareSaved")}</Button></InlineAlert>}
      <details open={!status.connected || status.needsReconnect} className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("xtra.connectTitle")}</summary>
        <div className="mt-3 flex min-w-0 flex-col gap-3">
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
      <Button type="button" disabled={busy || !state || !status.configured} onClick={() => {
        if (!state) return; void perform(async () => { const next = await api.post<CollectAndGoStatus>("/shopping/collect-and-go/session", { state, userIds }); setState(null); return next; });
      }}>{t("collectAndGo.saveSession")}</Button>
      <p className="text-xs text-muted-foreground">{t("collectAndGo.browserPrivacy")}</p>
        </div>
      </details>
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void perform(() => api.get<CollectAndGoStatus>("/shopping/collect-and-go/status"))}>{t("collectAndGo.refresh")}</Button>
      {status?.connected && status.canManage && <ConfirmDialog trigger={<Button type="button" variant="outline" disabled={busy}>{t("collectAndGo.disconnect")}</Button>} title={t("collectAndGo.disconnect")} description={t("collectAndGo.disconnectDescription")} confirmLabel={t("collectAndGo.disconnect")} cancelLabel={t("common:actions.cancel")} destructive onConfirm={() => perform(async () => { await api.delete("/shopping/collect-and-go/session"); setState(null); return api.get<CollectAndGoStatus>("/shopping/collect-and-go/status"); })} />}
      <a href="https://www.collectandgo.be/nl/home" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.open")}</a>
    </div>
  </section>;
}
