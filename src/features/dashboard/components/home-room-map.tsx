import { useState } from "react";
import { ExpandIcon, MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { RecordLink } from "@/components/shared/record-link";
import { EmptyState } from "@/components/shared/empty-state";
import { IconChip } from "@/components/shared/icon-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeDevicePlan } from "@/features/devices";
import { FloorPlanView } from "@/features/places";
import type { HomeMapData } from "../data/home-map-loader";
import { useHomeWorkMarkers } from "./use-home-work-markers";

/** A floor preview opens the full-screen explorer; rooms are selected directly on the map. */
export function HomeRoomMap({ data, live = true, now }: { data: HomeMapData | null; live?: boolean; now?: number }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const [floorId, setFloorId] = useState<string | null>(null);
  const plan = data?.plans.find((row) => row.floor.id === floorId) ?? data?.plans[0];
  const { markers } = useHomeDevicePlan(data?.devices ?? null, plan?.floor.id ?? null, live, now);
  const work = useHomeWorkMarkers(data);
  const explore = `/house${plan ? `?floor=${encodeURIComponent(plan.floor.id)}` : ""}`;
  return <Card className="gap-4">
    <CardHeader><div className="flex min-w-0 items-center gap-3"><IconChip icon={MapIcon} tone="home" /><div><CardTitle>{t("rooms.title")}</CardTitle><CardDescription>{t("rooms.description")}</CardDescription></div></div>
      <Button variant="outline" asChild><RecordLink to={explore}><ExpandIcon />{t("rooms.explore")}</RecordLink></Button>
    </CardHeader>
    {!data?.places ? <p role="status">{t("loadError")}</p> : !plan ? <EmptyState icon={MapIcon} title={t(data.places.floors.length ? "rooms.planError" : "rooms.empty")} action={<Button asChild variant="outline"><RecordLink to="/places">{t("rooms.manage")}</RecordLink></Button>} /> : <>
      <Select value={plan.floor.id} onValueChange={setFloorId}><SelectTrigger className="w-full sm:w-52" aria-label={t("rooms.floor")}><SelectValue /></SelectTrigger><SelectContent>{data.plans.map((row) => <SelectItem key={row.floor.id} value={row.floor.id}>{row.floor.name}</SelectItem>)}</SelectContent></Select>
      <FloorPlanView plan={plan} markers={[...markers, ...(work[plan.floor.id] ?? [])]} onPlaceClick={(id) => navigate(`${explore}&room=${encodeURIComponent(id)}`)} onMarkerClick={(id) => navigate(id.startsWith("room:") ? `${explore}&room=${encodeURIComponent(id.slice(5))}` : `${explore}&device=${encodeURIComponent(id)}`)} className="h-[26rem] min-h-80 sm:h-[32rem]" />
      {data.plansUnavailable && <p role="status" className="text-sm text-muted-foreground">{t("rooms.planError")}</p>}
    </>}
  </Card>;
}
export function HomeRoomMapSkeleton() {
  const { t } = useTranslation("dashboard");
  return <Card aria-busy="true" aria-label={t("rooms.title")}><CardTitle>{t("rooms.title")}</CardTitle><Skeleton className="h-11 w-full" /><Skeleton className="h-80 w-full" /></Card>;
}
