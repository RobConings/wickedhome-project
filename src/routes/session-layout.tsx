import { Outlet, useLoaderData } from "react-router";
import { AppFrame } from "@/app/app-frame";
import { sessionLoader, sessionShouldRevalidate } from "@/features/auth";
import { CanManageProvider } from "@/lib/permissions";
import { canManageHousehold } from "@/types/roles";

export const loader = sessionLoader;
export const shouldRevalidate = sessionShouldRevalidate;

export function Component() {
  const { user } = useLoaderData<typeof sessionLoader>();
  return (
    <AppFrame user={user}>
      {/* The household-wide rule; screens with their own rule provide it again around their content. */}
      <CanManageProvider value={canManageHousehold(user.role)}>
        <Outlet />
      </CanManageProvider>
    </AppFrame>
  );
}
