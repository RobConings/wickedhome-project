import { RetailerAccountAccess } from "./retailer-account-access";
import { PageSection } from "@/components/layout/page-section";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import * as React from "react";
import { ShoppingCartIcon } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api, ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RetailerBrowserImport } from "./retailer-browser-import";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { collectAndGoStateSchema, type CollectAndGoCheck, type CollectAndGoState, type CollectAndGoStatus } from "../types/collect-and-go";
import { importCollectAndGoBrowserData } from "../types/collect-and-go-browser-import";

export function CollectAndGoSettings({ initial }: { initial?: CollectAndGoStatus }) {
  const { t, i18n } = useTranslation("shopping");
  const [status, setStatus] = React.useState<CollectAndGoStatus | null>(initial ?? null);
  const [userIds, setUserIds] = React.useState(initial?.members.filter((member) => member.allowed).map((member) => member.id) ?? []);
  const [state, setState] = React.useState<CollectAndGoState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [checkedItems, setCheckedItems] = React.useState<number | null>(null);
  const [checking, setChecking] = React.useState(false);
  const fileRead = React.useRef(0);
  function accept(next: CollectAndGoStatus) { setStatus(next); setCheckedItems(null); setUserIds(next.members.filter((member) => member.allowed).map((member) => member.id)); }
  async function checkConnection() {
    setBusy(true); setChecking(true); setError(null); setCheckedItems(null);
    try {
      const result = await api.post<CollectAndGoCheck>("/shopping/collect-and-go/check");
      accept(result.status); setCheckedItems(result.cart.items.length);
    } catch (cause) {
      setStatus((current) => current ? { ...current, verifiedAt: null } : current);
      setError(cause instanceof ApiRequestError && ["collectandgo_login", "collectandgo_challenge", "collectandgo_unverified", "collectandgo_browser", "collectandgo_unavailable"].includes(cause.code) ? `checkErrors.${cause.code}` : "error");
    } finally { setBusy(false); setChecking(false); }
  }
  async function perform(work: () => Promise<CollectAndGoStatus>) { setBusy(true); setError(null); try { accept(await work()); } catch { setError("error"); } finally { setBusy(false); } }
  React.useEffect(() => { if (initial) return; let active = true; void api.get<CollectAndGoStatus>("/shopping/collect-and-go/status").then((data) => { if (active) { setStatus(data); setUserIds(data.members.filter((member) => member.allowed).map((member) => member.id)); } }).catch(() => { if (active) setError("error"); }); return () => { active = false; }; }, [initial]);
  function paste(text: string) {
    ++fileRead.current; setState(null); setError(null);
    try { setState(importCollectAndGoBrowserData(text)); } catch { setError("browserInvalid"); }
  }
  return <PageSection aria-label={t("collectAndGo.sectionTitle")}>
    <Badge variant="outline"><ShoppingCartIcon aria-hidden="true" />{t("collectAndGo.channel")}</Badge>
    <Text size="sm" tone="muted">{t("collectAndGo.description")}</Text>
    <Link to="/settings?section=xtra" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.xtraSeparate")}</Link>
    {error && <InlineAlert tone="error">{t(`collectAndGo.${error}`)}</InlineAlert>}
    {status && <Text size="sm" role="status">{(status.enabled || status.cartEnabled) && status.canUse && status.verifiedAt && !status.needsReconnect ? t("collectAndGo.verified", { date: new Date(status.verifiedAt).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" }) }) : t(!status.enabled && !status.cartEnabled ? "collectAndGo.disabled" : status.needsReconnect ? "collectAndGo.reconnect" : status.connected ? status.canUse ? "collectAndGo.importedUnverified" : "xtra.noAccess" : "collectAndGo.notImported")}</Text>}
    {checkedItems !== null && <Text size="sm" role="status">{t("collectAndGo.checkedItems", { count: checkedItems })}</Text>}
    {status && !status.enabled && <InlineAlert>{t(status.cartEnabled ? "collectAndGo.browserDisabledWithCart" : "collectAndGo.adminEnable")}</InlineAlert>}
    {status?.canManage && <>
      {!status.configured && <InlineAlert>{t("xtra.notConfigured")}</InlineAlert>}
      <Text size="sm" tone="muted">{t("collectAndGo.sharing")}</Text>
      <RetailerAccountAccess members={status.members} userIds={userIds} onChange={setUserIds} disabled={busy || !status.configured}
        actions={status.connected && <Button type="button" variant="outline" onClick={() => void perform(() => api.put<CollectAndGoStatus>("/shopping/collect-and-go/access", { userIds }))}>{t("xtra.saveAccess")}</Button>} />
      {status.legacyAvailable && <InlineAlert><Text>{t("collectAndGo.legacyHelp")}</Text><Button className="mt-2" type="button" variant="outline" disabled={busy || !status.configured} onClick={() => void perform(async () => { const next = await api.post<CollectAndGoStatus>("/shopping/collect-and-go/session/adopt", { userIds }); setState(null); return next; })}>{t("collectAndGo.shareSaved")}</Button></InlineAlert>}
      <details open={!status.connected || status.needsReconnect} className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("xtra.connectTitle")}</summary>
        <RetailerBrowserImport id="collectandgo-browser-data" disabled={busy} onImport={paste}
          steps={[t("collectAndGo.browserSignIn"), t("collectAndGo.browserNetwork"), t("xtra.browserSensitive"), t("collectAndGo.browserCopy")]}
          readyLabel={state ? t(state.cartApi ? "collectAndGo.cartReady" : "collectAndGo.browserReady") : undefined}
          privacy={t("collectAndGo.browserPrivacy")}
          alternative={<details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("collectAndGo.existingFile")}</summary>
        <Input className="mt-3" type="file" accept=".json,application/json" aria-label={t("collectAndGo.existingFile")} disabled={busy} onChange={(event) => {
          const read = ++fileRead.current; setState(null); setError(null); const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 900000) { setError("browserInvalid"); return; }
          void file.text().then((text) => { const parsed = collectAndGoStateSchema.safeParse(JSON.parse(text)); if (!parsed.success || !parsed.data.cookies.some((cookie) => /(^|\.)collectandgo\.be$/.test(cookie.domain))) throw new Error("invalid"); if (read === fileRead.current) setState(parsed.data); }).catch(() => { if (read === fileRead.current) setError("browserInvalid"); });
        }} />
      </details>}
          actions={<Button type="button" disabled={busy || !state || !status.configured} onClick={() => {
        if (!state) return; void perform(async () => { const next = await api.post<CollectAndGoStatus>("/shopping/collect-and-go/session", { state, userIds }); setState(null); return next; });
      }}>{t("collectAndGo.saveSession")}</Button>} />
      </details>
    </>}
    <Inline gap="sm" align="stretch" wrap>
      <Button type="button" variant="outline" loading={checking} disabled={busy || (!status?.enabled && !status?.cartEnabled) || !status?.connected || !status.canUse} onClick={() => void checkConnection()}>{t("collectAndGo.check")}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void perform(() => api.get<CollectAndGoStatus>("/shopping/collect-and-go/status"))}>{t("collectAndGo.refresh")}</Button>
      {status?.connected && status.canManage && <ConfirmDialog trigger={<Button type="button" variant="outline" disabled={busy}>{t("collectAndGo.disconnect")}</Button>} title={t("collectAndGo.disconnect")} description={t("collectAndGo.disconnectDescription")} confirmLabel={t("collectAndGo.disconnect")} cancelLabel={t("common:actions.cancel")} destructive onConfirm={() => perform(async () => { await api.delete("/shopping/collect-and-go/session"); setState(null); return api.get<CollectAndGoStatus>("/shopping/collect-and-go/status"); })} />}
      <a href="https://www.collectandgo.be/nl/home" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm underline">{t("collectAndGo.open")}</a>
    </Inline>
    <Text size="xs" tone="muted">{t("collectAndGo.checkHelp")}</Text>
  </PageSection>;
}
