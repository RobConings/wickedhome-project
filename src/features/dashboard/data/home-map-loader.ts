import { fetchDevicesOverview } from "@/features/devices";
import { fetchAppliances } from "@/features/energy";
import { fetchFloorPlan, fetchPlacesOverview } from "@/features/places";
import { fetchProjects } from "@/features/projects";
import { fetchTasksOverview } from "@/features/tasks";

const optional = <T>(request: Promise<T>) => request.catch(() => null);

/** Each owner supplies its own records. A failing owner stays unknown, never an empty count. */
export async function fetchHomeMap() {
  const [places, devices, appliances, projects, tasks] = await Promise.all([
    optional(fetchPlacesOverview()), optional(fetchDevicesOverview()), optional(fetchAppliances()),
    optional(fetchProjects()), optional(fetchTasksOverview()),
  ]);
  const plans = places ? await Promise.all(places.floors.map((floor) => optional(fetchFloorPlan(floor.id)))) : [];
  return { places, plans: plans.filter((plan) => plan !== null), devices, appliances, projects, tasks, plansUnavailable: plans.some((plan) => plan === null) };
}
export type HomeMapData = Awaited<ReturnType<typeof fetchHomeMap>>;
