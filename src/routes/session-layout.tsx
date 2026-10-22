import { Outlet, useLoaderData } from "react-router";
import { AppFrame } from "@/app/app-frame";
import { sessionLoader, sessionShouldRevalidate } from "@/features/auth";

export const loader = sessionLoader;
export const shouldRevalidate = sessionShouldRevalidate;

export function Component() {
  const { user } = useLoaderData<typeof sessionLoader>();
  return (
    <AppFrame user={user}>
      <Outlet />
    </AppFrame>
  );
}
