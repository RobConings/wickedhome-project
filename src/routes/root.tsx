import { Navigate, Outlet, isRouteErrorResponse, useRouteError } from "react-router";
import { AppProviders } from "@/app/app-providers";
import { CrashScreen, NotFoundScreen, SplashScreen } from "@/app/status-screens";
import { ApiRequestError } from "@/lib/api-client";

export function Component() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  // Session expired while browsing: back to login instead of an error page.
  if (error instanceof ApiRequestError && error.status === 401) return <Navigate to="/login" replace />;
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />;
  console.error(error);
  return <CrashScreen />;
}

export const HydrateFallback = SplashScreen;
