import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import * as React from "react";
import { CheckIcon, RefreshCwIcon } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useXtraList, type XtraListInitial } from "../data/use-xtra-list";
import type { XtraListItem } from "../types/xtra";

export function XtraListPanel({ initial, intervalMs }: { initial?: XtraListInitial; intervalMs?: number | null }) {
  const { t, i18n } = useTranslation("shopping");
  const { status, snapshot, error, loading, refresh } = useXtraList({ initial, intervalMs });
  const [visible, setVisible] = React.useState(50);
  if (!error && (!status?.connected || (!status.canUse && !status.canManage))) return null;
  const active = snapshot?.items.filter((item) => !item.completed) ?? [];
  const completed = snapshot?.items.filter((item) => item.completed) ?? [];
  function rows(items: XtraListItem[]) {
    return items.map((item) => <li key={item.id} className="flex min-w-0 items-start gap-3 border-b py-2.5 last:border-0">
      {item.completed && <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <span className={`min-w-0 flex-1 break-words text-sm ${item.completed ? "text-muted-foreground line-through" : ""}`}>{item.name}</span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{item.quantity === null ? "—" : new Intl.NumberFormat(i18n.language).format(item.quantity)}{item.quantity !== null && ` ${item.unit === "P" ? t("xtraList.pieces") : item.unit ?? ""}`}</span>
    </li>);
  }
  return <Card role="region" aria-label={t("xtraList.title")} className="gap-3">
    <CardHeader>
      <Stack gap="xs" className="min-w-0"><CardTitle>{t("xtraList.title")}{snapshot && ` · ${active.length}`}</CardTitle><CardDescription>{t("xtraList.description")}</CardDescription></Stack>
      <Button type="button" variant="outline" size="icon-sm" disabled={loading} aria-label={t("xtraList.refresh")} onClick={() => void refresh(true)}><RefreshCwIcon aria-hidden="true" className={loading ? "animate-spin" : ""} /></Button>
    </CardHeader>
    {status && !status.canUse && <Text size="sm" tone="muted">{t("xtraList.noAccess")}</Text>}
    {error && <InlineAlert tone="warning">{t(error === "reconnect" ? "xtraList.reconnect" : "xtraList.unavailable")}{snapshot && ` ${t("xtraList.stale")}`}</InlineAlert>}
    {loading && !snapshot && <Stack gap="sm" aria-label={t("xtraList.loading")} role="status"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-2/3" /></Stack>}
    {snapshot && <>
      <Text size="xs" tone="muted">{t("xtraList.checked", { date: new Date(snapshot.observedAt).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" }) })}</Text>
      {snapshot.truncated && <InlineAlert tone="warning">{t("xtraList.truncated")}</InlineAlert>}
      {active.length ? <ul className="max-h-80 overflow-y-auto">{rows(active.slice(0, visible))}</ul> : !snapshot.truncated && <Text size="sm" tone="muted">{t("xtraList.empty")}</Text>}
      {active.length > visible && <Button type="button" variant="ghost" className="self-start" onClick={() => setVisible((count) => count + 50)}>{t("xtraList.more", { count: active.length - visible })}</Button>}
      {completed.length > 0 && <details className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-sm text-muted-foreground">{t("xtraList.completed", { count: completed.length })}</summary><ul className="mt-2 max-h-60 overflow-y-auto">{rows(completed.slice(0, 100))}</ul>{completed.length > 100 && <Text size="xs" tone="muted">{t("xtraList.completedLimit")}</Text>}</details>}
    </>}
    <Inline gap="none" align="center" wrap className="gap-x-4 gap-y-1 text-sm">
      <a className="inline-flex min-h-10 items-center underline" href="https://www.colruyt.be/nl" target="_blank" rel="noopener noreferrer">{t("xtra.open")}</a>
      <Link to="/settings?section=xtra" className="inline-flex min-h-10 items-center underline">{t("xtraList.settings")}</Link>
    </Inline>
  </Card>;
}
