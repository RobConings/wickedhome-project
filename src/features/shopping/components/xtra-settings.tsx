import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ApiRequestError } from "@/lib/api-client";
import { xtraClient } from "../data/xtra-requests";
import { xtraCredentialsSchema, type XtraCredentials, type XtraStatus } from "../types/xtra";
import { importXtraBrowserData, XtraBrowserImportError } from "../types/xtra-browser-import";

export function XtraSettings({ initial, client = xtraClient }: { initial?: XtraStatus; client?: typeof xtraClient }) {
  const { t } = useTranslation("shopping");
  const [status, setStatus] = React.useState(initial ?? null);
  const [userIds, setUserIds] = React.useState(initial?.members.filter((member) => member.allowed).map((member) => member.id) ?? []);
  const [credentials, setCredentials] = React.useState<XtraCredentials | null>(null);
  const [credentialSource, setCredentialSource] = React.useState<"file" | "browser" | null>(null);
  const [fileKey, setFileKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRead = React.useRef(0);
  function accept(next: XtraStatus) { setStatus(next); setUserIds(next.members.filter((member) => member.allowed).map((member) => member.id)); }
  React.useEffect(() => {
    if (initial) return;
    let active = true;
    void client.status().then((next) => { if (active) { setStatus(next); setUserIds(next.members.filter((member) => member.allowed).map((member) => member.id)); } }).catch(() => { if (active) setError("error"); });
    return () => { active = false; };
  }, [client, initial]);
  async function perform(work: () => Promise<XtraStatus>, connecting = false) {
    setBusy(true); setError(null);
    try { accept(await work()); }
    catch (cause) { setError(cause instanceof ApiRequestError && cause.code === "xtra_reconnect" ? connecting ? "connectionRejected" : "reconnect" : "error"); }
    finally { setBusy(false); }
  }
  function readBrowserData(text: string) {
    ++fileRead.current;
    setCredentials(null); setCredentialSource(null); setError(null); setFileKey((key) => key + 1);
    try { setCredentials(importXtraBrowserData(text)); setCredentialSource("browser"); }
    catch (cause) { setError(`browserImportErrors.${cause instanceof XtraBrowserImportError ? cause.code : "invalid"}`); }
  }
  return <section aria-label="Xtra" className="flex min-w-0 flex-col gap-4">
    <p className="text-sm text-muted-foreground">{t("xtra.description")}</p>
    {error && <InlineAlert tone="error">{t(`xtra.${error}`)}</InlineAlert>}
    {status && <p role="status">{t(!status.configured ? "xtra.notConfigured" : status.needsReconnect ? "xtra.reconnect" : status.canUse ? "xtra.ready" : status.connected ? "xtra.noAccess" : "xtra.notConnected")}</p>}
    {status?.placeId && <p className="text-sm text-muted-foreground">{t("xtra.store", { id: status.placeId })}</p>}
    {status?.canManage && <>
      <p className="text-sm text-muted-foreground">{t("xtra.sharing")}</p>
      <fieldset disabled={busy} className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("xtra.accounts")}</legend>
        {status.members.map((member) => <label key={member.id} className="flex min-h-10 items-center gap-3 text-sm"><input className="size-5 accent-primary" type="checkbox" checked={userIds.includes(member.id)} onChange={(event) => setUserIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span>{member.name}{member.role === "child" && <span className="ml-2 text-muted-foreground">{t("xtra.readOnly")}</span>}</span></label>)}
        {status.connected && <Button type="button" variant="outline" onClick={() => void perform(() => client.access(userIds))}>{t("xtra.saveAccess")}</Button>}
      </fieldset>
      {status.configured && <details open={!status.connected || status.needsReconnect} className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("xtra.connectTitle")}</summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p>{t("xtra.browserIntro")}</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>{t("xtra.browserSignIn")}</li>
            <li>{t("xtra.browserNetwork")}</li>
            <li>{t("xtra.browserSensitive")}</li>
            <li>{t("xtra.browserCopy")}</li>
          </ol>
          <label htmlFor="xtra-browser-data" className="font-medium">{t("xtra.browserData")}</label>
          <Textarea id="xtra-browser-data" value="" autoComplete="off" spellCheck={false} disabled={busy} placeholder={t("xtra.browserPlaceholder")} className="min-h-20" onPaste={(event) => { event.preventDefault(); readBrowserData(event.clipboardData.getData("text/plain")); }} onChange={(event) => { if (event.target.value) readBrowserData(event.target.value); }} />
          {credentialSource === "browser" && <p role="status" className="text-sm text-primary">{t("xtra.browserReady")}</p>}
          <p className="text-xs text-muted-foreground">{t("xtra.browserPrivacy")}</p>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium">{t("xtra.helperAlternative")}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p>{t("xtra.desktop")}</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>npm run xtra:login</code></pre>
              <p>{t("xtra.uploadHelp")}</p>
              <label htmlFor="xtra-connection-file" className="font-medium">{t("xtra.file")}</label>
              <Input key={fileKey} id="xtra-connection-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
                const read = ++fileRead.current;
                setCredentials(null); setCredentialSource(null); setError(null);
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 32_000) { setError("invalidFile"); return; }
                void file.text().then((value) => { const parsed = xtraCredentialsSchema.safeParse(JSON.parse(value)); if (!parsed.success) throw new Error("invalid"); if (read === fileRead.current) { setCredentials(parsed.data); setCredentialSource("file"); } }).catch(() => { if (read === fileRead.current) setError("invalidFile"); });
              }} />
            </div>
          </details>
          <Button type="button" disabled={busy || !credentials} onClick={() => { if (!credentials) return; void perform(async () => { const next = await client.connect(credentials, userIds); setCredentials(null); setCredentialSource(null); setFileKey((key) => key + 1); return next; }, true); }}>{t("xtra.connect")}</Button>
          {credentialSource === "file" && <p className="text-xs text-muted-foreground">{t("xtra.secretFile")}</p>}
        </div>
      </details>}
      {status.connected && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void perform(client.check)}>{t("xtra.check")}</Button>
        <ConfirmDialog trigger={<Button type="button" variant="outline" disabled={busy}>{t("xtra.disconnect")}</Button>} title={t("xtra.disconnect")} description={t("xtra.disconnectHelp")} confirmLabel={t("xtra.disconnect")} cancelLabel={t("common:actions.cancel")} destructive onConfirm={() => perform(async () => { await client.disconnect(); return client.status(); })} />
      </div>}
    </>}
    <a className="inline-flex min-h-10 items-center text-sm underline" href="https://www.colruyt.be/nl" target="_blank" rel="noopener noreferrer">{t("xtra.open")}</a>
  </section>;
}
