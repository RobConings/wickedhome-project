import { FolderKanbanIcon, ListChecksIcon, PlugIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink } from "@/components/shared/record-link";
import { ProjectAvatar } from "@/features/projects";
import { useHomeDevicePlan, DeviceStateChip } from "@/features/devices";
import type { HomeMapData } from "../data/home-map-loader";

/** Owner-supplied room context reused by the full-screen home explorer. */
export function HomeRoomSummary({ data, roomId, live = true, now }: { data: HomeMapData; roomId: string; live?: boolean; now?: number }) {
  const { t } = useTranslation("dashboard");
  const room = data.places?.places.find((item) => item.id === roomId);
  const { devices, stateOf } = useHomeDevicePlan(data.devices, room?.floorId ?? null, live, now);
  const roomDevices = devices.filter((device) => device.place?.id === roomId);
  const tasks = data.tasks?.tasks.filter((task) => task.place?.id === roomId && task.status === "open");
  const projects = data.projects?.projects.filter((project) => project.places.some((place) => place.id === roomId) && ["active", "planned"].includes(project.status));
  const appliances = data.appliances?.filter((appliance) => appliance.placeId === roomId && !roomDevices.some((device) => device.appliance?.id === appliance.id));
  const groups = [
    { id: "devices", title: t("rooms.appliances"), icon: PlugIcon, unknown: !data.devices || !data.appliances, empty: t("rooms.noAppliances"), rows: [
      ...roomDevices.map((device) => { const state = stateOf(device); return <li key={device.id}><RecordLink to={`/devices/${encodeURIComponent(device.id)}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 hover:bg-muted"><span>{device.name}</span>{state && <DeviceStateChip state={state} />}</RecordLink></li>; }),
      ...(appliances ?? []).map((appliance) => <li key={appliance.id} className="px-2 py-2">{appliance.name}</li>),
    ] },
    { id: "tasks", title: t("rooms.tasks"), icon: ListChecksIcon, unknown: !data.tasks, empty: t("rooms.noTasks"), rows: tasks?.map((task) => <li key={task.id}><RecordLink to={`/tasks/${encodeURIComponent(task.id)}`} className="flex min-h-11 items-center rounded-lg px-2 hover:bg-muted">{task.title}</RecordLink></li>) ?? [] },
    { id: "projects", title: t("rooms.projects"), icon: FolderKanbanIcon, unknown: !data.projects, empty: t("rooms.noProjects"), rows: projects?.map((project) => <li key={project.id}><RecordLink to={`/projects/${encodeURIComponent(project.id)}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-muted"><ProjectAvatar project={project} size="sm" />{project.name}</RecordLink></li>) ?? [] },
  ];
  return <div className="flex flex-col gap-4">{groups.map(({ id, title, icon: Icon, unknown, empty, rows }) => <section key={id} aria-label={title}>
    <h3 className="mb-1 flex items-center gap-2 font-semibold"><Icon className="size-4 text-section" aria-hidden="true" />{title}</h3>
    {rows.length > 0 ? <ul>{rows}</ul> : <p className="text-sm text-muted-foreground">{unknown ? t("loadError") : empty}</p>}
  </section>)}</div>;
}
