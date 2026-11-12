import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator } from "react-router";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/shared/inline-alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { providerClient } from "../data/provider-client";
import type { PairingSession, ProviderStatus } from "../types/providers";

/** Personal provider settings; no credential is ever sent to this component. */
export function AssistantProviderSettings({ compact = false, initial }: { compact?: boolean; initial?: ProviderStatus }) {
  const { t } = useTranslation("assistant");
  const revalidator = useRevalidator();
  const [status, setStatus] = React.useState(initial ?? null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pairing, setPairing] = React.useState<PairingSession | null>(null);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (initial) return;
    let active = true;
    void providerClient.status().then((data) => { if (active) setStatus(data); }).catch(() => { if (active) setError(t("provider.loadFailed")); });
    return () => { active = false; };
  }, [initial, t]);
  const work = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); } catch { setError(t("provider.operationFailed")); } finally { setBusy(false); }
  };
  const refresh = async () => setStatus(await providerClient.status());
  const choose = async (value: string) => {
    if (!status) return;
    const result = await providerClient.select(value === "local" ? { provider: "local" } : { provider: "chatgpt_subscription", model: value, accountId: status.accountId ?? undefined });
    setStatus(result);
    await revalidator.revalidate();
  };
  const command = pairing ? `npm run assistant:pair -- --server ${pairing.server} --code ${pairing.code}` : "";
  const picker = status && (
    <select aria-label={t("provider.selected")} className="min-h-9 max-w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={status.provider === "local" ? "local" : status.model ?? ""} disabled={busy} onChange={(event) => void work(() => choose(event.target.value))}>
      <option value="local">{t("provider.local")}{status.local.model ? ` · ${status.local.model}` : ""}</option>
      {status.connected && status.models.map((model) => <option key={model.slug} value={model.slug}>{t("provider.chatgpt")} · {model.displayName}</option>)}
      {status.provider === "chatgpt_subscription" && !status.models.some((m) => m.slug === status.model) && <option value={status.model ?? ""} disabled>{t("provider.reconnect")}</option>}
    </select>
  );
  const notice = status?.needsPlanNotice && <div className="rounded-lg border bg-muted/30 p-3 text-sm" role="status"><p className="font-medium">{t("provider.usingPlan")}</p><p className="text-muted-foreground">{t("provider.planNotice")}</p><Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void work(async () => { await providerClient.acknowledgePlan(); setStatus({ ...status, needsPlanNotice: false }); })}>{t("provider.gotIt")}</Button></div>;
  if (compact) return <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{picker ?? <Link to="/settings?section=assistant">{t("provider.title")}</Link>}{status?.provider === "chatgpt_subscription" && <p className="flex flex-wrap items-center gap-x-2"><span>{t("provider.usingPlan")}</span><a href={status.usageUrl} target="_blank" rel="noopener noreferrer" className="underline">{t("provider.manageUsage")}</a></p>}{notice}{error && <span role="alert">{error}</span>}</div>;
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("provider.title")}>
      <div><h2 className="font-semibold">{t("provider.title")}</h2><p className="text-sm text-muted-foreground">{t("provider.description")}</p></div>
      {notice}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {status && <>
        <label className="flex min-w-0 flex-col gap-2 text-sm">{t("provider.selected")}{picker}</label>
        {status.accounts.length > 1 && <label className="flex flex-col gap-2 text-sm">{t("provider.account")}<select aria-label={t("provider.account")} className="min-h-10 min-w-0 rounded-md border bg-background p-2" value={status.accountId ?? ""} disabled={busy} onChange={(event) => void work(async () => setStatus(await providerClient.status(event.target.value)))}>{status.accounts.map((account) => <option key={account.id} value={account.id}>{account.email ?? account.id} · {account.id.slice(-8)}</option>)}</select></label>}
        <p className="text-sm" role="status">{t(status.connected ? "provider.connected" : "provider.disconnected")}{status.accountId && ` · ${status.accounts.find((a) => a.id === status.accountId)?.email ?? status.accountId}`}</p>
        {status.error && <InlineAlert tone="error">{t(`errors.${status.error}`, { defaultValue: t("provider.reconnect") })}</InlineAlert>}
        {!status.storageReady && <InlineAlert tone="info">{t("provider.storageSetup")}</InlineAlert>}
        {status.connected && !status.permission && <InlineAlert tone="info">{t("provider.permissionRequired")}</InlineAlert>}
        <div className="flex flex-wrap gap-2">
          <Button className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90" data-oai-siwc-button="" disabled={busy || !status.storageReady} onClick={() => void work(async () => { setPairing(await providerClient.pair(false, status.accountId ?? undefined)); setCopied(false); })}><img src="/brand/chatgpt-logo-white.svg" alt="" className="size-5 dark:invert" />{t("provider.continue")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void work(refresh)}>{t("provider.refresh")}</Button>
          {status.accountId && <Button variant="outline" disabled={busy} onClick={() => void work(async () => { setPairing(await providerClient.pair(true)); setCopied(false); })}>{t("provider.addAccount")}</Button>}
          {status.connected && <ConfirmDialog trigger={<Button variant="outline" disabled={busy}>{t("provider.disconnect")}</Button>} title={t("provider.disconnect")} description={t("provider.disconnectDescription")} confirmLabel={t("provider.disconnect")} cancelLabel={t("confirm.cancel")} destructive onConfirm={() => work(async () => { const result = await providerClient.disconnect(status.accountId ?? undefined); setStatus(await providerClient.status(status.accountId ?? undefined)); await revalidator.revalidate(); if (!result.remoteRevoked) setError(t("provider.revocationUnconfirmed")); })} />}
        </div>
        <a href={status.usageUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">{t("provider.usage")}</a>
      </>}
      {pairing && <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/30 p-4">
        <h3 className="font-medium">{t("provider.pairTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("provider.pairInstructions")}</p>
        <pre className="overflow-x-auto rounded-md border bg-background p-3 text-xs"><code>{command}</code></pre>
        <p className="text-xs text-muted-foreground">{t("provider.expires", { time: new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void work(async () => { await navigator.clipboard.writeText(command); setCopied(true); })}>{t(copied ? "chat.copied" : "chat.copy")}</Button>
          <Button onClick={() => void work(async () => { await refresh(); setPairing(null); })}>{t("provider.pairDone")}</Button>
          <Button variant="ghost" onClick={() => void work(async () => { await providerClient.cancelPair(); setPairing(null); })}>{t("confirm.cancel")}</Button>
        </div>
        <a className="text-sm underline" href="https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms" target="_blank" rel="noopener noreferrer">{t("provider.pairDocs")}</a>
      </div>}
      {!status && !error && <p role="status" className="text-sm text-muted-foreground">{t("page.loading")}</p>}
    </section>
  );
}
