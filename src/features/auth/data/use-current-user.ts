import { useRouteLoaderData } from "react-router";
import type { SessionUser } from "../types/auth";
import { SESSION_ROUTE_ID, type SessionLoaderData } from "./auth-loaders";

/** The logged-in user. Only use inside routes below the session route. */
export function useCurrentUser(): SessionUser {
  const data = useRouteLoaderData(SESSION_ROUTE_ID) as SessionLoaderData | undefined;
  if (!data) throw new Error("useCurrentUser() used outside the signed-in part of the app");
  return data.user;
}

/** The logged-in user, or null outside the signed-in part of the app (stories, public pages). */
export function useOptionalCurrentUser(): SessionUser | null {
  const data = useRouteLoaderData(SESSION_ROUTE_ID) as SessionLoaderData | undefined;
  return data?.user ?? null;
}
