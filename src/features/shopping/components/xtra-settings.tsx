import { RetailerAccountAccess } from "./retailer-account-access";
import { PageSection } from "@/components/layout/page-section";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RetailerBrowserImport } from "./retailer-browser-import";
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
  return <PageSection aria-label="Xtra">
    <Text size="sm" tone="muted">{t("xtra.description")}</Text>
    {error && <InlineAlert tone="error">{t(`xtra.${error}`)}</InlineAlert>}
    {status && <Text role="status">{t(!status.configured ? "xtra.notConfigured" : status.needsReconnect ? "xtra.reconnect" : status.canUse ? "xtra.ready" : status.connected ? "xtra.noAccess" : "xtra.notConnected")}</Text>}
    {status?.placeId && <Text size="sm" tone="muted">{t("xtra.store", { id: status.placeId })}</Text>}
    {status?.canManage && <>
      <Text size="sm" tone="muted">{t("xtra.sharing")}</Text>
      <RetailerAccountAccess members={status.members} userIds={userIds} onChange={setUserIds} disabled={busy}
        actions={status.connected && <Button type="button" variant="outline" onClick={() => void perform(() => client.access(userIds))}>{t("xtra.saveAccess")}</Button>} />
      {status.configured && <details open={!status.connected || status.needsReconnect} className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("xtra.connectTitle")}</summary>
        <RetailerBrowserImport id="xtra-browser-data" disabled={busy} onImport={readBrowserData}
          description={t("xtra.browserIntro")}
          steps={[t("xtra.browserSignIn"), t("xtra.browserNetwork"), t("xtra.browserSensitive"), t("xtra.browserCopy")]}
          readyLabel={credentialSource === "browser" ? t("xtra.browserReady") : undefined}
          privacy={t("xtra.browserPrivacy")}
          alternative={<details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium">{t("xtra.helperAlternative")}</summary>
            <Stack gap="3" className="mt-3">
              <Text>{t("xtra.desktop")}</Text>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>npm run xtra:login</code></pre>
              <Text>{t("xtra.uploadHelp")}</Text>
              <label htmlFor="xtra-connection-file" className="font-medium">{t("xtra.file")}</label>
              <Input key={fileKey} id="xtra-connection-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
                const read = ++fileRead.current;
                setCredentials(null); setCredentialSource(null); setError(null);
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 32_000) { setError("invalidFile"); return; }
                void file.text().then((value) => { const parsed = xtraCredentialsSchema.safeParse(JSON.parse(value)); if (!parsed.success) throw new Error("invalid"); if (read === fileRead.current) { setCredentials(parsed.data); setCredentialSource("file"); } }).catch(() => { if (read === fileRead.current) setError("invalidFile"); });
              }} />
            </Stack>
          </details>}
          actions={<Button type="button" disabled={busy || !credentials} onClick={() => { if (!credentials) return; void perform(async () => { const next = await client.connect(credentials, userIds); setCredentials(null); setCredentialSource(null); setFileKey((key) => key + 1); return next; }, true); }}>{t("xtra.connect")}</Button>}
          footer={credentialSource === "file" && <Text size="xs" tone="muted">{t("xtra.secretFile")}</Text>} />
      </details>}
      {status.connected && <Inline gap="sm" align="stretch" wrap>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void perform(client.check)}>{t("xtra.check")}</Button>
        <ConfirmDialog trigger={<Button type="button" variant="outline" disabled={busy}>{t("xtra.disconnect")}</Button>} title={t("xtra.disconnect")} description={t("xtra.disconnectHelp")} confirmLabel={t("xtra.disconnect")} cancelLabel={t("common:actions.cancel")} destructive onConfirm={() => perform(async () => { await client.disconnect(); return client.status(); })} />
      </Inline>}
    </>}
    <a className="inline-flex min-h-10 items-center text-sm underline" href="https://www.colruyt.be/nl" target="_blank" rel="noopener noreferrer">{t("xtra.open")}</a>
  </PageSection>;
}
