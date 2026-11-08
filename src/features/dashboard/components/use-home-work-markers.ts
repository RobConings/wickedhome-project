import { FolderKanbanIcon, ListChecksIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PlanMarker } from "@/features/places";
import type { HomeMapData } from "../data/home-map-loader";

/** Work markers describe a room's associated work, never an invented physical task position. */
export function useHomeWorkMarkers(data: HomeMapData | null): Record<string, PlanMarker[]> {
  const { t } = useTranslation("dashboard");
  return Object.fromEntries((data?.plans ?? []).map((plan) => [plan.floor.id, plan.places.flatMap((room): PlanMarker[] => {
    if (!room.polygon?.length) return [];
    const tasks = data?.tasks?.tasks.filter((task) => task.place?.id === room.id && task.status === "open").length;
    const projects = data?.projects?.projects.filter((project) => project.places.some((place) => place.id === room.id) && ["active", "planned"].includes(project.status)).length;
    if (!tasks && !projects) return [];
    const center = room.polygon.reduce((point, next) => ({ x: point.x + next.x / room.polygon!.length, y: point.y + next.y / room.polygon!.length }), { x: 0, y: 0 });
    return [{ id: `room:${room.id}`, ...center, label: `${room.name} · ${t("rooms.work", { tasks: tasks ?? "?", projects: projects ?? "?" })}`, tone: "info", icon: projects ? FolderKanbanIcon : ListChecksIcon }];
  })]));
}

