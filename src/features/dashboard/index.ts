// Public API of the dashboard feature.
//
// The loader returns one un-awaited promise per card; the screen renders at once with a skeleton per card.
// The route passes `homeStatus` (Devices' house status, wrapped in its own Suspense) to `DashboardScreen`.
export {
  dashboardLoader,
  type DashboardData,
  type DashboardScreenData,
  type DashboardSlice,
  type DeferredDashboardData,
} from "./data/dashboard-loaders";
export { DashboardScreen } from "./screens/dashboard-screen";
export { HomeRoomMap, HomeRoomMapSkeleton } from "./components/home-room-map";
export { fetchHomeMap } from "./data/home-map-loader";

export { HomeRoomSummary } from "./components/home-room-summary";
export { useHomeWorkMarkers } from "./components/use-home-work-markers";
