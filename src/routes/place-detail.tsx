import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { PlaceAppliancesSection } from "@/features/energy";
import { PlaceStockSection } from "@/features/inventory";
import { PlaceDetailScreen, canManagePlaces, placeDetailLoader, placesAction } from "@/features/places";
import { PlaceShoppingSection } from "@/features/shopping";
import { PlaceTasksSection } from "@/features/tasks";
import { screenHandle } from "@/lib/screen-context";

export const loader = placeDetailLoader;
export const action = placesAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "place", id: data.place.id, label: data.place.name }));

export function Component() {
  const user = useCurrentUser();
  const detail = useLoaderData<typeof placeDetailLoader>();
  const placeId = detail.place.id;
  return (
    <PlaceDetailScreen
      detail={detail}
      canManage={canManagePlaces(user.role)}
      sections={{
        // Keyed: another place starts with a skeleton instead of the previous place's tasks.
        tasks: <PlaceTasksSection key={placeId} placeId={placeId} />,
        stock: <PlaceStockSection placeId={placeId} />,
        shopping: <PlaceShoppingSection placeId={placeId} />,
        appliances: <PlaceAppliancesSection placeId={placeId} />,
      }}
    />
  );
}
