import * as React from "react";
import { AppWindowIcon, KeyRoundIcon, LinkIcon, PencilIcon, PlugIcon, PlusIcon, Trash2Icon, UnplugIcon, WandSparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Inline } from "./inline";
import { Stack } from "./stack";
import { Card } from "./card";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { GeneralFormDialog } from "./general-form-dialog";
import type { GeneralFormField } from "./general-form";
import { GeneralList } from "./general-list";
import { InlineAlert } from "./inline-alert";
import { SkeletonList } from "./loading-state";
import { SegmentedControl } from "./segmented-control";
import { currentLocale } from "@/lib/i18n";
import { formatDateTime } from "@/types/date-format";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import { mcpOAuthClient, type McpOAuthClient } from "../data/mcp-oauth-client";
import { MCP_OAUTH_APP_INTENT, MCP_OAUTH_HOSTS_INTENT, type McpOAuthActionResult } from "../data/mcp-oauth-loaders";
import {
  mcpOAuthAppInputSchema,
  mcpOAuthSettingsInputSchema,
  type CreatedMcpOAuthApp,
  type McpConnectedApp,
  type McpOAuthApp,
  type McpOAuthOverview,
} from "../types/mcp-oauth";
import { CopyText, McpTokensPanel } from "./mcp-tokens-panel";

export type McpConnectMethod = "token" | "dcr" | "app";

type McpConnectionsPanelProps = {
  client?: AssistantClient;
  oauthClient?: McpOAuthClient;
  /** Skip loading (stories). */
  initial?: McpOAuthOverview;
  defaultMethod?: McpConnectMethod;
};

const hostOf = (uri: string) => {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
};

function Code({ children }: { children: React.ReactNode }) {
  return <code className="min-w-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all select-all">{children}</code>;
}

/** "Connected apps": every live OAuth grant (owners see the household's, others their own), revocable. */
function ConnectedApps({ apps, onDisconnect }: { apps: McpConnectedApp[]; onDisconnect: (app: McpConnectedApp) => Promise<void> }) {
  const { t } = useTranslation("assistant");
  const locale = currentLocale();
  const meta = (app: McpConnectedApp) => [
    app.redirectHost,
    app.scope === "write" ? t("tokens.scopeWrite") : t("tokens.scopeRead"),
    app.person,
    app.lastUsedAt ? t("tokens.lastUsed", { date: formatDateTime(app.lastUsedAt, locale) }) : t("tokens.neverUsed"),
  ];
  const revoke = (app: McpConnectedApp) => (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={t("oauth.connected.revoke")}>
          <UnplugIcon />
        </Button>
      }
      title={t("oauth.connected.revokeTitle", { name: app.clientName })}
      description={t("oauth.connected.revokeDescription", { person: app.person })}
      confirmLabel={t("oauth.connected.revoke")}
      cancelLabel={t("confirm.cancel")}
      destructive
      onConfirm={() => onDisconnect(app)}
    />
  );
  return (
    <Stack gap="sm">
      <h4 className="text-sm font-semibold">{t("oauth.connected.title")}</h4>
      <GeneralList
        items={apps}
        getKey={(app) => app.id}
        label={t("oauth.connected.title")}
        storageKey="assistant-connected-apps"
        search={{ keys: (app) => [app.clientName, app.redirectHost, app.person] }}
        emptyState={<p className="text-sm text-muted-foreground">{t("oauth.connected.empty")}</p>}
        renderRow={(app) => (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{app.clientName}</span>
              <span className="text-xs text-muted-foreground break-words">{meta(app).join(" · ")}</span>
            </div>
            {revoke(app)}
          </div>
        )}
        renderTile={(app) => (
          <Card className="gap-2 p-4">
            <Inline justify="between" align="start">
              <span className="min-w-0 text-sm font-medium break-words">{app.clientName}</span>
              {revoke(app)}
            </Inline>
            <Badge variant="secondary" className="w-fit">
              {app.redirectHost}
            </Badge>
            <span className="text-xs text-muted-foreground break-words">{meta(app).slice(1).join(" · ")}</span>
          </Card>
        )}
      />
    </Stack>
  );
}

/** Automatic registration: how to connect, and for owners the switch and the allowed redirect hosts. */
function DcrSection({ overview, onSettings, client }: { overview: McpOAuthOverview; onSettings: (settings: McpOAuthOverview["settings"]) => void; client: McpOAuthClient }) {
  const { t } = useTranslation("assistant");
  const [saving, setSaving] = React.useState(false);
  const { settings } = overview;
  const id = React.useId();
  const toggle = async (dcrEnabled: boolean) => {
    setSaving(true);
    try {
      onSettings(await client.updateSettings({ dcrEnabled }));
      toast.success(dcrEnabled ? t("oauth.dcr.turnedOn") : t("oauth.dcr.turnedOff"));
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };
  const hostsField: GeneralFormField[] = [
    { type: "textarea", name: "allowedHosts", label: t("oauth.dcr.hostsLabel"), description: t("oauth.dcr.hostsHelp"), rows: 4, span: "full", optional: true },
  ];

  return (
    <Stack gap="sm">
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-pretty">
        <li>{t("oauth.dcr.chatgpt", { url: overview.serverUrl })}</li>
        <li>{t("oauth.dcr.claude", { url: overview.serverUrl })}</li>
      </ul>
      {settings ? (
        <Stack gap="sm" className="rounded-lg border p-3">
          <Inline gap="md" justify="between" align="start">
            <Stack gap="xs" className="min-w-0">
              <Label htmlFor={`${id}-dcr`}>{t("oauth.dcr.switch")}</Label>
              <p className="text-xs text-muted-foreground text-pretty">{t("oauth.dcr.switchHelp")}</p>
            </Stack>
            <Switch id={`${id}-dcr`} checked={settings.dcrEnabled} disabled={saving} onCheckedChange={(checked) => void toggle(checked)} />
          </Inline>
          <Stack gap="xs">
            <span className="text-sm font-medium">{t("oauth.dcr.hostsLabel")}</span>
            {settings.allowedHosts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {settings.allowedHosts.map((host) => (
                  <Badge key={host} variant="outline">
                    {host}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("oauth.dcr.noHosts")}</p>
            )}
          </Stack>
          <GeneralFormDialog<McpOAuthActionResult>
            trigger={
              <Button variant="outline" size="sm" className="w-full sm:w-fit">
                <PencilIcon />
                {t("oauth.dcr.editHosts")}
              </Button>
            }
            title={t("oauth.dcr.editHosts")}
            description={t("oauth.dcr.hostsHelp")}
            successMessage={t("oauth.dcr.hostsSaved")}
            schema={mcpOAuthSettingsInputSchema}
            fields={hostsField}
            intent={MCP_OAUTH_HOSTS_INTENT}
            defaultValues={{ allowedHosts: settings.allowedHosts.join("\n") }}
            translateError={(message) => t(`oauth.errors.${message}`, { defaultValue: message })}
            onSuccess={(result) => result.settings && onSettings(result.settings)}
          />
        </Stack>
      ) : (
        <InlineAlert tone="info">{t("oauth.dcr.ownerOnly")}</InlineAlert>
      )}
    </Stack>
  );
}

/** Manual OAuth apps (owners): name + redirect URIs → client ID and an optional secret, shown once. */
function AppsSection({ overview, onCreated, onDeleted, client }: { overview: McpOAuthOverview; onCreated: (app: CreatedMcpOAuthApp) => void; onDeleted: (id: string) => void; client: McpOAuthClient }) {
  const { t } = useTranslation("assistant");
  const locale = currentLocale();
  const [created, setCreated] = React.useState<CreatedMcpOAuthApp | null>(null);
  if (!overview.apps) return <InlineAlert tone="info">{t("oauth.apps.ownerOnly")}</InlineAlert>;

  const fields: GeneralFormField[] = [
    { type: "text", name: "name", label: t("oauth.apps.name"), placeholder: t("oauth.apps.namePlaceholder"), maxLength: 60, span: "full", autoFocus: true },
    { type: "textarea", name: "redirectUris", label: t("oauth.apps.redirectUris"), description: t("oauth.apps.redirectUrisHelp"), rows: 3, span: "full" },
    { type: "switch", name: "confidential", label: t("oauth.apps.confidential"), description: t("oauth.apps.confidentialHelp"), span: "full" },
  ];
  const remove = (app: McpOAuthApp) => (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={t("oauth.apps.delete")}>
          <Trash2Icon />
        </Button>
      }
      title={t("oauth.apps.deleteTitle", { name: app.name })}
      description={t("oauth.apps.deleteDescription")}
      confirmLabel={t("oauth.apps.delete")}
      cancelLabel={t("confirm.cancel")}
      destructive
      onConfirm={() =>
        client
          .deleteApp(app.id)
          .then(() => {
            onDeleted(app.id);
            toast.success(t("oauth.apps.deleted"));
          })
          .catch(() => toast.error(t("errors.generic")))
      }
    />
  );
  const details = (app: McpOAuthApp) => (
    <span className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {t("oauth.apps.clientId")} <Code>{app.clientId}</Code>
      </span>
      <span className="break-words">
        {app.redirectUris.map(hostOf).join(", ")} · {app.confidential ? t("oauth.apps.withSecret") : t("oauth.apps.pkceOnly")} ·{" "}
        {app.lastUsedAt ? t("tokens.lastUsed", { date: formatDateTime(app.lastUsedAt, locale) }) : t("tokens.neverUsed")}
      </span>
    </span>
  );

  return (
    <Stack gap="sm">
      <p className="text-sm text-pretty">{t("oauth.apps.howTo")}</p>
      <GeneralList
        items={overview.apps}
        getKey={(app) => app.id}
        label={t("oauth.apps.title")}
        storageKey="assistant-oauth-apps"
        search={{ keys: (app) => [app.name, app.clientId, ...app.redirectUris] }}
        emptyState={<EmptyState icon={AppWindowIcon} title={t("oauth.apps.empty")} className="py-4" />}
        renderRow={(app) => (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{app.name}</span>
              {details(app)}
            </div>
            {remove(app)}
          </div>
        )}
        renderTile={(app) => (
          <Card className="gap-2 p-4">
            <Inline justify="between" align="start">
              <span className="min-w-0 text-sm font-medium break-words">{app.name}</span>
              {remove(app)}
            </Inline>
            {details(app)}
          </Card>
        )}
      />
      <GeneralFormDialog<McpOAuthActionResult>
        trigger={
          <Button variant="outline" className="min-h-10 w-full sm:w-fit">
            <PlusIcon />
            {t("oauth.apps.create")}
          </Button>
        }
        title={t("oauth.apps.create")}
        description={t("oauth.apps.createDescription")}
        schema={mcpOAuthAppInputSchema}
        fields={fields}
        intent={MCP_OAUTH_APP_INTENT}
        defaultValues={{ name: "", redirectUris: "", confidential: true }}
        translateError={(message) => t(`oauth.errors.${message}`, { defaultValue: message })}
        onSuccess={(result) => {
          if (!result.app) return;
          onCreated(result.app);
          setCreated(result.app);
        }}
      />

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("oauth.apps.createdTitle")}</DialogTitle>
            <DialogDescription>{created?.clientSecret ? t("oauth.apps.createdWithSecret") : t("oauth.apps.createdPublic")}</DialogDescription>
          </DialogHeader>
          {created && (
            <Stack gap="sm">
              <Stack gap="xs">
                <span className="text-sm font-medium">{t("oauth.apps.clientId")}</span>
                <code className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{created.clientId}</code>
                <CopyText text={created.clientId} />
              </Stack>
              {created.clientSecret && (
                <Stack gap="xs">
                  <span className="text-sm font-medium">{t("oauth.apps.clientSecret")}</span>
                  <code className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{created.clientSecret}</code>
                  <CopyText text={created.clientSecret} />
                </Stack>
              )}
            </Stack>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setCreated(null)}>
              {t("tokens.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

/**
 * Connecting other assistants to the MCP server, as a choice of three equal ways: a personal token (the
 * existing panel, unchanged), OAuth with automatic registration (ChatGPT/Claude connectors) or an owner's
 * manual OAuth app. Below them the apps connected over OAuth. Loads its own data. ai/docs/MCP-OAUTH.md.
 */
export function McpConnectionsPanel({ client = assistantClient, oauthClient = mcpOAuthClient, initial, defaultMethod = "token" }: McpConnectionsPanelProps) {
  const { t } = useTranslation("assistant");
  const id = React.useId();
  const [method, setMethod] = React.useState<McpConnectMethod>(defaultMethod);
  const [overview, setOverview] = React.useState<McpOAuthOverview | null>(initial ?? null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    oauthClient
      .overview()
      .then((data) => !cancelled && setOverview(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [oauthClient, initial]);

  const update = (change: (current: McpOAuthOverview) => McpOAuthOverview) => setOverview((current) => (current ? change(current) : current));
  const disconnect = async (app: McpConnectedApp) => {
    try {
      await oauthClient.disconnect(app.id);
      update((current) => ({ ...current, connected: current.connected.filter((candidate) => candidate.id !== app.id) }));
      toast.success(t("oauth.connected.revoked"));
    } catch {
      toast.error(t("errors.generic"));
    }
  };

  const methods = [
    { value: "token" as const, label: t("connect.methods.token"), icon: KeyRoundIcon },
    { value: "dcr" as const, label: t("connect.methods.dcr"), icon: WandSparklesIcon },
    { value: "app" as const, label: t("connect.methods.app"), icon: LinkIcon },
  ];

  const oauthBody = (render: (data: McpOAuthOverview) => React.ReactNode) =>
    failed ? <InlineAlert tone="error">{t("oauth.loadFailed")}</InlineAlert> : overview === null ? <SkeletonList rows={2} /> : render(overview);

  return (
    <section className="flex flex-col gap-3 rounded-lg border px-3 py-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <PlugIcon className="size-4" aria-hidden />
          {t("connect.title")}
        </h3>
        <p className="text-sm text-muted-foreground text-pretty">{t("connect.description")}</p>
      </div>
      <SegmentedControl options={methods} value={method} onChange={setMethod} label={t("connect.title")} className="max-w-full" />
      <p className="text-sm text-pretty" aria-live="polite">
        <span className="font-medium">{t("connect.whenLabel")}</span> {t(`connect.when.${method}`)}
      </p>

      {method === "token" && <McpTokensPanel client={client} />}
      {method === "dcr" && oauthBody((data) => <DcrSection overview={data} client={oauthClient} onSettings={(settings) => update((current) => ({ ...current, settings }))} />)}
      {method === "app" &&
        oauthBody((data) => (
          <AppsSection
            overview={data}
            client={oauthClient}
            onCreated={({ clientSecret: _secret, ...app }) => update((current) => ({ ...current, apps: [app, ...(current.apps ?? [])] }))}
            onDeleted={(appId) => update((current) => ({ ...current, apps: (current.apps ?? []).filter((candidate) => candidate.id !== appId) }))}
          />
        ))}

      {/* Whichever way was chosen, the apps connected over OAuth are always listed. */}
      {oauthBody((data) => <ConnectedApps apps={data.connected} onDisconnect={disconnect} />)}
    </section>
  );
}
