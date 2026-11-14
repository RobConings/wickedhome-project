import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { HouseIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Card, CardTitle } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { InlineAlert } from "@/components/shared/inline-alert";
import { RecordLink } from "@/components/shared/record-link";
import { HomeDeviceBrowser, type Device, type DeviceProfile } from "@/features/devices";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useLiveEvents } from "@/lib/live-events";
import { fetchHomeActions } from "../data/home-actions-requests";
import type { HomeAction, HomeActionsOverview, HomeRule } from "../types/home-actions";
import { HomeControlNavigation } from "../components/home-control-navigation";
import { homeView } from "../types/home-view";
import { HomeActionEditor } from "../components/home-action-editor";
import { HomeActionRunDialog } from "../components/home-action-run-dialog";
import { HomeRuleEditor } from "../components/home-rule-editor";
import { HomeActionHistory } from "../components/home-action-history";

export function HomeControlScreen({ initial, devices, profiles, rooms, canManage, map, alarm, renderDeviceControls, live = true }: { initial: HomeActionsOverview; devices: Device[]; profiles: DeviceProfile[]; rooms: { id: string; name: string; floorName: string }[]; canManage: boolean; map: ReactNode; alarm: ReactNode; renderDeviceControls: (device: Device) => ReactNode; live?: boolean }) {
  const { t } = useTranslation("home-actions"), [params, setParams] = useSearchParams();
  const resource = useAsyncResource("home-control", fetchHomeActions, live ? {} : { initial });
  useLiveEvents("home_actions.changed", resource.refresh, { enabled: live });
  useLiveEvents("device.value", resource.refresh, { enabled: live });
  useLiveEvents("home_assistant.status", resource.refresh, { enabled: live });
  useLiveEvents("ready", resource.refresh, { enabled: live });
  const overview = resource.data ?? initial, view = homeView(params);
  const [editingAction, setEditingAction] = useState<HomeAction | "new" | null>(null), [editingRule, setEditingRule] = useState<HomeRule | "new" | null>(null);
  const active = overview.runs.some((run) => ["requested", "running", "arming"].includes(run.status));
  const actions = view === "overview" ? overview.actions.filter((action) => action.favourite) : overview.actions;
  if (view === "map") return map;
  return <PageContainer><PageHeader title={t("title")} description={t(`descriptions.${view}`)} actions={<Button asChild variant="outline"><RecordLink to="/home-assistant">{t("connections")}</RecordLink></Button>} /><HomeControlNavigation />
    {!overview.connected && <InlineAlert tone="warning">{t("offline")}</InlineAlert>}
    {resource.error && <InlineAlert tone="error">{t("loadError")}<Button variant="outline" onClick={resource.refresh}>{t("retry")}</Button></InlineAlert>}
    {view === "devices" && <HomeDeviceBrowser devices={devices} profiles={profiles} canSetValues={canManage} renderControls={renderDeviceControls} live={live} />}
    {(view === "overview" || view === "actions") && <>
      <Inline justify="between" wrap><Text size="lg" weight="semibold">{t("actions.title")}</Text>{canManage && <Button variant="outline" onClick={() => { setEditingAction("new"); setParams((next) => { next.set("section", "actions"); return next; }); }}><PlusIcon />{t("actions.new")}</Button>}</Inline>
      {!actions.length && <Text tone="muted">{t("actions.empty")}</Text>}
      <PageGrid columns="cards">{actions.map((action) => <Card key={action.id}><CardTitle>{action.name}</CardTitle><Text size="sm" tone="muted">{action.revision === action.publishedRevision ? t("editor.published") : t("editor.draft")}{action.alarmMode ? ` · ${t("actions.manualAlarm")}` : ""}</Text><Inline wrap>{canManage && <HomeActionRunDialog action={action} onStarted={resource.refresh} disabled={active || !overview.connected} />}{canManage && <Button variant="outline" onClick={() => { setEditingAction(action); setParams((next) => { next.set("section", "actions"); return next; }); }}>{t("edit")}</Button>}</Inline></Card>)}</PageGrid>
      {view === "actions" && canManage && editingAction && <HomeActionEditor key={editingAction === "new" ? "new" : editingAction.id} initial={editingAction === "new" ? undefined : editingAction} devices={overview.devices} canPublish={overview.publishingReady && !active} onSaved={resource.refresh} onClose={() => setEditingAction(null)} />}
    </>}
    {view === "overview" && <>
      <PageGrid columns="2"><Stack>{alarm}<Card><CardTitle>{t("overview.devices")}</CardTitle><Text tone="muted">{t("overview.deviceHint")}</Text><Button variant="outline" onClick={() => setParams((next) => { next.set("section", "devices"); return next; })}>{t("views.devices")}</Button><Button asChild variant="outline"><RecordLink to="/devices">{t("overview.manage")}</RecordLink></Button></Card></Stack><Card><CardTitle>{t("overview.rooms")}</CardTitle>{rooms.map((room) => <Button key={room.id} variant="ghost" className="h-auto justify-start whitespace-normal text-left" onClick={() => setParams((next) => { next.set("section", "devices"); next.set("place", room.id); return next; })}><HouseIcon /><span>{room.name}<span className="text-sm text-muted-foreground"> · {room.floorName}</span></span></Button>)}</Card></PageGrid>
      <HomeActionHistory runs={overview.runs.slice(0, 8)} canManage={canManage} onChanged={resource.refresh} />
    </>}
    {view === "actions" && <HomeActionHistory runs={overview.runs} canManage={canManage} onChanged={resource.refresh} />}
    {view === "rules" && <><Inline justify="between" wrap><Text size="lg" weight="semibold">{t("rules.title")}</Text>{canManage && <Button variant="outline" onClick={() => setEditingRule("new")}><PlusIcon />{t("rules.new")}</Button>}</Inline><PageGrid columns="cards">{overview.rules.map((rule) => <Card key={rule.id}><CardTitle>{rule.name}</CardTitle><Text>{rule.revision === rule.publishedRevision ? rule.enabled ? t("rules.active") : t("rules.inactive") : t("editor.draft")}</Text><Text size="sm" tone="muted">{t(`rules.${rule.trigger.kind}`)}{rule.trigger.kind === "time" ? ` · ${rule.trigger.at}` : ""} → {overview.actions.find((action) => action.id === rule.actionId)?.name}</Text>{canManage && <Button variant="outline" onClick={() => setEditingRule(rule)}>{t("edit")}</Button>}</Card>)}</PageGrid>{canManage && editingRule && <HomeRuleEditor key={editingRule === "new" ? "new" : editingRule.id} initial={editingRule === "new" ? undefined : editingRule} actions={overview.actions} devices={overview.devices} canPublish={overview.publishingReady} onSaved={resource.refresh} onClose={() => setEditingRule(null)} />}</>}
  </PageContainer>;
}
