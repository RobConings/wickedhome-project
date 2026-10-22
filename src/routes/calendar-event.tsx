import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { CalendarEventScreen, calendarEventAction, calendarEventLoader, canManageCalendar } from "@/features/calendar";
import { ShopShoppingList } from "@/features/shopping";
import { screenHandle } from "./lib/screen-context";

export const loader = calendarEventLoader;
export const action = calendarEventAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "event", id: data.event.id, label: data.event.title }));

export function Component() {
  const user = useCurrentUser();
  return (
    <CalendarEventScreen
      data={useLoaderData<typeof calendarEventLoader>()}
      canManage={canManageCalendar(user.role)}
      renderShopList={(shopId) => <ShopShoppingList shopId={shopId} />}
    />
  );
}
