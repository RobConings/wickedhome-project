import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { PlacesScreen, canManagePlaces, placesAction, placesLoader } from "@/features/places";
import { screenHandle } from "./lib/screen-context";

export const loader = placesLoader;
export const action = placesAction;
export const handle = screenHandle(({ t }) => ({ kind: "places", label: t("nav.places") }));

export function Component() {
  const user = useCurrentUser();
  return <PlacesScreen overview={useLoaderData<typeof placesLoader>()} canManage={canManagePlaces(user.role)} />;
}
