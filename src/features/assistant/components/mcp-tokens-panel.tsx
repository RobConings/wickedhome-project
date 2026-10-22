import * as React from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { SkeletonList } from "@/components/shared/loading-state";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { assistantClient, type AssistantClient } from "../data/assistant-client";
import type { AssistantAccessToken, AssistantTokenScope, CreatedAssistantToken } from "../types/assistant";

/** Copies `text` to the clipboard (hidden where the browser has no clipboard). Also used by the OAuth panel. */
export function CopyText({ text }: { text: string }) {
  const { t } = useTranslation("assistant");
  const [copied, setCopied] = React.useState(false);
  if (typeof navigator === "undefined" || !navigator.clipboard) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? t("tokens.copied") : t("tokens.copy")}
    </Button>
  );
}

/**
 * Personal MCP tokens: the server address, the list (name, access, last used), make one (shown once) and
 * revoke. Loads its own data.
 */
export function McpTokensPanel({ client = assistantClient, initial }: { client?: AssistantClient; initial?: AssistantAccessToken[] }) {
  const { t } = useTranslation("assistant");
  const locale = currentLocale();
  const [tokens, setTokens] = React.useState<AssistantAccessToken[] | null>(initial ?? null);
  const [failed, setFailed] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scope, setScope] = React.useState<AssistantTokenScope>("read");
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedAssistantToken | null>(null);
  const id = React.useId();
  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    client
      .listTokens()
      .then((list) => !cancelled && setTokens(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [client, initial]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const token = await client.createToken({ name: name.trim(), scope });
      setCreated(token);
      setTokens((list) => [token, ...(list ?? [])]);
      setName("");
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <KeyRoundIcon className="size-4" aria-hidden />
          {t("tokens.title")}
        </h3>
        <p className="text-sm text-muted-foreground text-pretty">{t("tokens.description")}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("tokens.url")}</span>
        <code className="min-w-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all select-all">{endpoint}</code>
      </div>

      {failed ? (
        <InlineAlert tone="error">{t("tokens.loadFailed")}</InlineAlert>
      ) : tokens === null ? (
        <SkeletonList rows={2} />
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("tokens.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{token.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  <code className="font-mono">{token.prefix}…</code> · {token.scope === "write" ? t("tokens.scopeWrite") : t("tokens.scopeRead")} ·{" "}
                  {token.lastUsedAt ? t("tokens.lastUsed", { date: formatDate(token.lastUsedAt, locale) }) : t("tokens.neverUsed")}
                </span>
              </div>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label={t("tokens.revoke")}>
                    <Trash2Icon />
                  </Button>
                }
                title={t("tokens.revokeTitle", { name: token.name })}
                description={t("tokens.revokeDescription")}
                confirmLabel={t("tokens.revoke")}
                cancelLabel={t("confirm.cancel")}
                destructive
                onConfirm={() =>
                  client
                    .revokeToken(token.id)
                    .then(() => {
                      setTokens((list) => (list ?? []).filter((candidate) => candidate.id !== token.id));
                      toast.success(t("tokens.revoked"));
                    })
                    .catch(() => toast.error(t("errors.generic")))
                }
              />
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-name`}>{t("tokens.name")}</Label>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("tokens.namePlaceholder")} maxLength={60} disabled={creating} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-scope`}>{t("tokens.scope")}</Label>
          <Select value={scope} onValueChange={(value) => setScope(value as AssistantTokenScope)} disabled={creating}>
            <SelectTrigger id={`${id}-scope`} className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">{t("tokens.scopeRead")}</SelectItem>
              <SelectItem value="write">{t("tokens.scopeWrite")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" loading={creating} disabled={!name.trim()} className="min-h-10">
          {t("tokens.create")}
        </Button>
      </form>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tokens.createdTitle")}</DialogTitle>
            <DialogDescription>{t("tokens.createdDescription")}</DialogDescription>
          </DialogHeader>
          <code className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{created?.token}</code>
          <DialogFooter className="gap-2">
            {created && <CopyText text={created.token} />}
            <Button type="button" onClick={() => setCreated(null)}>
              {t("tokens.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
