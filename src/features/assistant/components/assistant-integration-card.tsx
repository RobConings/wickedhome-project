import * as React from "react";
import { ActivityIcon, BotIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { InlineAlert } from "@/components/shared/inline-alert";
import { IntegrationCard, IntegrationCardSkeleton, IntegrationSetupSteps, type IntegrationSetupStep } from "@/features/integrations";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import type { McpOAuthClient } from "../data/mcp-oauth-client";
import type { AssistantProbe, AssistantStatus } from "../types/assistant";
import { AssistantSkillsList } from "./assistant-skills-list";
import { McpConnectionsPanel } from "./mcp-connections-panel";
import { VoicePicker } from "./voice-picker";

type AssistantIntegrationCardProps = {
  /** The status, a deferred promise of it (skeleton meanwhile), or `null` (failed to load). */
  data: AssistantStatus | null | Promise<AssistantStatus | null>;
  client?: AssistantClient;
  /** The OAuth part of the MCP connections (stories pass a fake). */
  oauthClient?: McpOAuthClient;
  /** Show the MCP connections: personal tokens and OAuth (default true). */
  showTokens?: boolean;
  /** Link to /assistant (hidden on the assistant page itself). */
  showOpenLink?: boolean;
};

function Deferred(props: Omit<AssistantIntegrationCardProps, "data"> & { promise: Promise<AssistantStatus | null> }) {
  return <AssistantCardContent {...props} status={React.use(props.promise)} />;
}

/**
 * The assistant on the Integrations page: status, server and model, a connection test with the round-trip
 * time, what it can do, MCP connections (personal tokens, OAuth); and the owner's setup steps while it isn't
 * configured.
 */
export function AssistantIntegrationCard({ data, ...props }: AssistantIntegrationCardProps) {
  const { t } = useTranslation("assistant");
  if (data instanceof Promise) {
    return (
      <React.Suspense fallback={<IntegrationCardSkeleton icon={BotIcon} title={t("card.title")} />}>
        <Deferred promise={data} {...props} />
      </React.Suspense>
    );
  }
  return <AssistantCardContent status={data} {...props} />;
}

function assistantSetupSteps(t: (key: string) => string): IntegrationSetupStep[] {
  return [
    { kind: "text", text: t("card.setup.install") },
    { kind: "text", text: t("card.setup.serve") },
    { kind: "env", name: "ASSISTANT_BASE_URL", hint: t("card.setup.url") },
    { kind: "env", name: "ASSISTANT_MODEL", hint: t("card.setup.model") },
    { kind: "env", name: "ASSISTANT_STT_URL", hint: t("card.setup.stt") },
    { kind: "env", name: "ASSISTANT_TTS_URL", hint: t("card.setup.tts") },
    { kind: "env", name: "SEARCH_URL", hint: t("card.setup.search") },
    { kind: "command", command: "pm2 restart wickedhome", hint: t("card.setup.restart") },
  ];
}

function AssistantCardContent({
  status,
  client = assistantClient,
  oauthClient,
  showTokens = true,
  showOpenLink = true,
}: Omit<AssistantIntegrationCardProps, "data"> & { status: AssistantStatus | null }) {
  const { t } = useTranslation("assistant");
  const [probe, setProbe] = React.useState<AssistantProbe | null>(null);
  const [testing, setTesting] = React.useState(false);

  if (!status) {
    return (
      <IntegrationCard icon={BotIcon} title={t("card.title")} description={t("card.description")} status="error">
        <InlineAlert tone="error">{t("errors.generic")}</InlineAlert>
      </IntegrationCard>
    );
  }

  const test = async () => {
    setTesting(true);
    try {
      setProbe(await client.test());
    } catch {
      setProbe({ reachable: false, latencyMs: null, models: [], modelListed: null, error: t("errors.generic") });
    } finally {
      setTesting(false);
    }
  };

  const cardStatus = !status.configured ? "not_configured" : probe && (probe.error || !probe.reachable) ? "error" : "connected";
  const actions = status.configured ? (
    <>
      <Button variant="outline" size="sm" onClick={() => void test()} loading={testing}>
        <ActivityIcon />
        {testing ? t("card.testing") : t("card.test")}
      </Button>
      {showOpenLink && (
        <Button asChild size="sm">
          <Link to="/assistant">{t("card.open")}</Link>
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <IntegrationCard
      icon={BotIcon}
      title={t("card.title")}
      description={t("card.description")}
      status={cardStatus}
      statusLabel={status.configured && cardStatus === "connected" && status.model ? t("card.statusModel", { model: status.model }) : undefined}
      actions={actions}
    >
      {!status.configured ? (
        <>
          {status.problem && status.problem !== "missing_url" && <InlineAlert tone="error">{t(`card.problem.${status.problem}`)}</InlineAlert>}
          <IntegrationSetupSteps intro={t("card.setup.intro")} steps={assistantSetupSteps(t)} />
        </>
      ) : (
        <DescriptionList>
          <DescriptionItem label={t("card.server")}>{status.host ?? "—"}</DescriptionItem>
          <DescriptionItem label={t("card.model")}>{status.model ?? "—"}</DescriptionItem>
          <DescriptionItem label={t("card.speech")}>{status.stt ? t("card.speechServer") : t("card.speechBrowser")}</DescriptionItem>
          <DescriptionItem label={t("card.voiceOutput")}>
            {!status.tts?.configured
              ? t("card.voiceBrowser")
              : status.tts.ok === false
                ? t("card.voiceUnreachable", { host: status.tts.host ?? "" })
                : t("card.voiceServer", { host: status.tts.host ?? "" })}
          </DescriptionItem>
          <DescriptionItem label={t("card.web")}>
            {!status.web?.configured
              ? t("card.webOff")
              : status.web.ok === false
                ? t("card.webUnreachable", { host: status.web.host ?? "" })
                : t("card.webServer", { host: status.web.host ?? "" })}
          </DescriptionItem>
        </DescriptionList>
      )}

      {status.tts?.problem && <InlineAlert tone="warning">{t(`card.ttsProblem.${status.tts.problem}`)}</InlineAlert>}
      {status.web?.problem && <InlineAlert tone="warning">{t(`card.webProblem.${status.web.problem}`)}</InlineAlert>}

      {probe && (
        <InlineAlert tone={probe.error ? "error" : "success"}>
          {probe.error ? t("card.testFailed", { error: probe.error }) : t("card.latency", { ms: probe.latencyMs ?? 0 })}
          {probe.modelListed === false && (
            <span className="block">{t("card.modelMissing", { model: status.model ?? "", models: probe.models.slice(0, 8).join(", ") })}</span>
          )}
        </InlineAlert>
      )}

      {status.tools.length > 0 && (
        <details className="group rounded-lg border px-3 py-2">
          <summary className="flex min-h-8 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
            {t("card.tools")}
            <span className="text-xs font-normal text-muted-foreground">
              {status.skills?.length ? t("card.skillsCount", { count: status.skills.length, tools: status.tools.length }) : t("card.toolsCount", { count: status.tools.length })}
            </span>
          </summary>
          {status.skills?.length ? (
            <div className="mt-2 pb-1">
              <AssistantSkillsList skills={status.skills} />
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5 pb-1">
              {status.tools.map((tool) => (
                <li key={tool.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{tool.activity}</span>
                  <Badge variant={tool.permission === "read" ? "secondary" : tool.permission === "sensitive" ? "destructive" : "outline"}>
                    {t(`card.permission.${tool.permission}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() =>
              void client
                .resetPreferences()
                .then(() => toast.success(t("card.preferencesReset")))
                .catch(() => toast.error(t("errors.generic")))
            }
          >
            {t("card.resetPreferences")}
          </Button>
        </details>
      )}

      {status.configured && status.tts?.configured && <VoicePicker client={client} className="rounded-lg border px-3 py-3" />}

      {showTokens && <McpConnectionsPanel client={client} oauthClient={oauthClient} />}
    </IntegrationCard>
  );
}
