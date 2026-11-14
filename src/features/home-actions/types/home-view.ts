export const HOME_VIEWS = ["overview", "map", "devices", "actions", "rules"] as const;
export type HomeView = typeof HOME_VIEWS[number];
export function homeView(params: URLSearchParams): HomeView {
  const requested = params.get("section");
  return HOME_VIEWS.find((view) => view === requested) ?? (params.has("floor") || params.has("device") || params.has("room") ? "map" : "overview");
}
