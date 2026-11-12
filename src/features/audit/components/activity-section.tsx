import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import * as React from "react";
import { useSearchParams } from "react-router";
import { HistoryIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { auditClient, type AuditClient } from "../data/audit-requests";
import { AUDIT_CHANNELS, AUDIT_RETENTION_DAYS, auditDomainOf, type AuditChannel, type AuditEntry, type AuditPage, type AuditQuery } from "../types/audit";
import { AuditEntryRow, AuditEntryTile } from "./audit-entry-row";

const ALL = "all";

type Filters = { channel: string; userId: string; action: string };
const NO_FILTERS: Filters = { channel: ALL, userId: ALL, action: ALL };

type Loaded = AuditPage & { key: string };

const toQuery = (filters: Filters, q: string, cursor?: string): AuditQuery => ({
  channel: filters.channel === ALL ? undefined : (filters.channel as AuditChannel),
  userId: filters.userId === ALL ? undefined : filters.userId,
  // The action filter works per domain: "alarm." matches alarm.armed_home, alarm.disarmed…
  action: filters.action === ALL ? undefined : `${filters.action}.`,
  q: q || undefined,
  cursor,
});

type ActivitySectionProps = {
  /** API access; stories pass a fake. */
  client?: AuditClient;
};

/**
 * Settings → Activity (owners and adults): the household audit log, newest first. Filters for channel (app,
 * assistant, MCP, job), person and kind of action, a search over names and descriptions (server-side), and
 * "Show older" for the next page. Loads its own data.
 */
export function ActivitySection({ client = auditClient }: ActivitySectionProps) {
  const { t, i18n } = useTranslation("audit");
  const [search, setSearch] = useSearchParams();
  const filters = React.useMemo<Filters>(() => ({ channel: search.get("auditChannel") || ALL, userId: search.get("auditPerson") || ALL, action: search.get("auditAction") || ALL }), [search]);
  const query = search.get("auditQ") ?? "";
  const setFilters = (next: Filters) => setSearch((previous) => {
    const params = new URLSearchParams(previous);
    for (const [field, key] of [["channel", "auditChannel"], ["userId", "auditPerson"], ["action", "auditAction"]] as const) {
      if (next[field] === ALL) params.delete(key); else params.set(key, next[field]);
    }
    return params;
  }, { replace: true, preventScrollReset: true });
  const setQuery = (value: string) => setSearch((previous) => { const next = new URLSearchParams(previous); if (value) next.set("auditQ", value); else next.delete("auditQ"); return next; }, { replace: true, preventScrollReset: true });
  const [retry, setRetry] = React.useState(0);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [failedKey, setFailedKey] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const key = JSON.stringify([filters, query, retry]);

  React.useEffect(() => {
    let cancelled = false;
    client
      .list(toQuery(filters, query))
      .then((page) => {
        if (!cancelled) setLoaded({ ...page, key });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [client, filters, query, key]);

  const failed = failedKey === key;
  const pending = !failed && loaded !== null && loaded.key !== key;
  const filtered = filters.channel !== ALL || filters.userId !== ALL || filters.action !== ALL;
  const domains = [...new Set((loaded?.actions ?? []).map(auditDomainOf))].sort();
  const domainLabel = (domain: string) => (i18n.exists(`audit:domains.${domain}`) ? t(`domains.${domain}`) : domain);

  async function loadMore() {
    if (!loaded?.nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await client.list(toQuery(filters, query, loaded.nextCursor));
      setLoaded((current) => (current && current.key === key ? { ...current, entries: [...current.entries, ...page.entries], nextCursor: page.nextCursor } : current));
    } catch {
      toast.error(t("list.moreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const setFilter = (name: keyof Filters) => (value: string) => setFilters({ ...filters, [name]: value });

  const toolbar = (
    <Inline gap="sm" align="stretch" wrap>
      <Select value={filters.channel} onValueChange={setFilter("channel")}>
        <SelectTrigger className="w-full sm:w-40" aria-label={t("filters.channel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allChannels")}</SelectItem>
          {AUDIT_CHANNELS.map((channel) => (
            <SelectItem key={channel} value={channel}>
              {t(`channels.${channel}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.userId} onValueChange={setFilter("userId")}>
        <SelectTrigger className="w-full sm:w-44" aria-label={t("filters.person")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allPeople")}</SelectItem>
          {(loaded?.people ?? []).map((person) => (
            <SelectItem key={person.userId} value={person.userId}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.action} onValueChange={setFilter("action")}>
        <SelectTrigger className="w-full sm:w-48" aria-label={t("filters.action")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allActions")}</SelectItem>
          {domains.map((domain) => (
            <SelectItem key={domain} value={domain}>
              {domainLabel(domain)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtered && (
        <Button variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
          {t("filters.clear")}
        </Button>
      )}
    </Inline>
  );

  return (
    <Stack gap="3">
      <GeneralList<AuditEntry>
        label={t("list.label")}
        items={loaded?.entries ?? []}
        getKey={(entry) => entry.id}
        renderRow={(entry) => <AuditEntryRow entry={entry} />}
        renderTile={(entry) => <AuditEntryTile entry={entry} />}
        search={{ query, onSearch: setQuery, placeholder: t("list.search") }}
        storageKey="settings-activity"
        viewParam="auditView"
        defaultView="list"
        toolbar={toolbar}
        filtered={filtered || query !== ""}
        loading={loaded === null && !failed}
        pending={pending}
        error={failed ? t("list.error") : undefined}
        onRetry={() => setRetry((value) => value + 1)}
        emptyState={<EmptyState icon={HistoryIcon} title={t("empty.title")} description={t("empty.description")} />}
      />
      {loaded?.nextCursor && !pending && (
        <Button variant="outline" className="self-center" loading={loadingMore} onClick={() => void loadMore()}>
          {t("list.more")}
        </Button>
      )}
      <Text size="sm" tone="muted">{t("section.retention", { days: AUDIT_RETENTION_DAYS })}</Text>
    </Stack>
  );
}
