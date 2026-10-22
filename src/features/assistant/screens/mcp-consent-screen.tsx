import * as React from "react";
import { BookOpenIcon, GlobeIcon, PencilLineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CenteredLayout } from "../components/centered-layout";
import { Inline } from "../components/inline";
import { Stack } from "../components/stack";
import { BrandMark } from "../components/brand-mark";
import { Card, CardDescription, CardTitle } from "../components/card";
import { InlineAlert } from "../components/inline-alert";
import { LanguageSwitcher } from "../components/language-switcher";
import { currentLocale, setLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { mcpOAuthClient, type McpOAuthClient } from "../data/mcp-oauth-client";
import type { McpConsentLoaderData } from "../data/mcp-oauth-loaders";
import type { McpOAuthScope } from "../types/mcp-oauth";

type McpConsentScreenProps = {
  data: McpConsentLoaderData;
  client?: McpOAuthClient;
  /** Where the browser goes after the decision (stories pass a no-op). */
  navigate?: (url: string) => void;
};

function ScopeOption({
  value,
  checked,
  onChange,
  title,
  description,
  icon: Icon,
}: {
  value: McpOAuthScope;
  checked: boolean;
  onChange: (value: McpOAuthScope) => void;
  title: string;
  description: string;
  icon: typeof BookOpenIcon;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <input type="radio" name="scope" value={value} checked={checked} onChange={() => onChange(value)} className="mt-1 size-4 shrink-0 accent-primary" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 shrink-0" aria-hidden />
          {title}
        </span>
        <span className="text-sm text-muted-foreground text-pretty">{description}</span>
      </span>
    </label>
  );
}

/**
 * `/connect/:requestId`: the OAuth consent page for ChatGPT, Claude and other MCP clients
 * (ai/docs/MCP-OAUTH.md). Phone first, outside the app frame. Shows who asks, where the tokens go (the real
 * redirect host, prominently) and what they may do; children are refused outright.
 */
export function McpConsentScreen({ data, client = mcpOAuthClient, navigate = (url) => window.location.assign(url) }: McpConsentScreenProps) {
  const { t } = useTranslation("assistant");
  const { consent, user, requestId } = data;
  const canWrite = consent?.requestedScopes.includes("write") ?? false;
  const [scope, setScope] = React.useState<McpOAuthScope>("read");
  const [busy, setBusy] = React.useState<"allow" | "deny" | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  const decide = async (decision: "allow" | "deny") => {
    if (!consent) return;
    setBusy(decision);
    try {
      const { redirectTo } = await client.decide(requestId, { decision, scope, csrf: consent.csrf });
      setLeaving(true);
      navigate(redirectTo);
    } catch {
      toast.error(t("consent.failed"));
      setBusy(null);
    }
  };

  return (
    <CenteredLayout>
      <Stack gap="lg">
        <Inline justify="between">
          <BrandMark />
          <LanguageSwitcher value={currentLocale()} onChange={(locale) => void setLocale(locale)} />
        </Inline>
        <Card className="gap-5 p-5 sm:p-8">
          {!consent ? (
            <Stack gap="sm">
              <CardTitle className="text-xl">{t("consent.expiredTitle")}</CardTitle>
              <CardDescription>{t("consent.expiredDescription")}</CardDescription>
            </Stack>
          ) : (
            <>
              <Stack gap="xs">
                <CardTitle className="text-xl text-balance break-words">{t("consent.title", { client: consent.clientName })}</CardTitle>
                <CardDescription>{t("consent.signedInAs", { name: user.name, household: user.householdName })}</CardDescription>
              </Stack>

              {/* Where the tokens really go: the redirect URI's host, not the name the client gave itself. */}
              <div className="flex items-start gap-3 rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
                <GlobeIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-muted-foreground">{t("consent.tokensGoTo")}</span>
                  <span className="text-lg font-semibold break-all">{consent.redirectHost}</span>
                </div>
              </div>

              {consent.refused === "child" ? (
                <InlineAlert tone="error">{t("consent.childRefused")}</InlineAlert>
              ) : (
                <>
                  <InlineAlert tone="warning">{t("consent.onlyIfYou", { host: consent.redirectHost })}</InlineAlert>
                  <fieldset className="flex flex-col gap-2" disabled={busy !== null || leaving}>
                    <legend className="mb-2 text-sm font-medium">{t("consent.accessLabel")}</legend>
                    <ScopeOption value="read" checked={scope === "read"} onChange={setScope} icon={BookOpenIcon} title={t("consent.read")} description={t("consent.readDescription")} />
                    {canWrite && (
                      <ScopeOption
                        value="write"
                        checked={scope === "write"}
                        onChange={setScope}
                        icon={PencilLineIcon}
                        title={t("consent.write")}
                        description={t("consent.writeDescription", { client: consent.clientName })}
                      />
                    )}
                  </fieldset>
                  <p className="text-xs text-muted-foreground text-pretty">{t("consent.dataNote", { client: consent.clientName })}</p>
                </>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" className="min-h-10 w-full sm:w-auto" loading={busy === "deny"} disabled={busy !== null || leaving} onClick={() => void decide("deny")}>
                  {consent.refused ? t("consent.back") : t("consent.deny")}
                </Button>
                {!consent.refused && (
                  <Button type="button" className="min-h-10 w-full sm:w-auto" loading={busy === "allow"} disabled={busy !== null || leaving} onClick={() => void decide("allow")}>
                    {t("consent.allow")}
                  </Button>
                )}
              </div>
              {leaving && (
                <p className="text-center text-sm text-muted-foreground" role="status">
                  {t("consent.leaving", { host: consent.redirectHost })}
                </p>
              )}
            </>
          )}
        </Card>
      </Stack>
    </CenteredLayout>
  );
}
