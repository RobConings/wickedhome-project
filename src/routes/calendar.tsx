import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { CalendarScreen, calendarAction, calendarLoader, calendarShouldRevalidate, canManageCalendar } from "@/features/calendar";
import { ShopShoppingList } from "@/features/shopping";
import { screenHandle } from "@/lib/screen-context";

export const loader = calendarLoader;
export const action = calendarAction;
export const handle = screenHandle(({ t }) => ({ kind: "calendar", label: t("nav.calendar") }));
export const shouldRevalidate = calendarShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  return (
    <CalendarScreen
      data={useLoaderData<typeof calendarLoader>()}
      canManage={canManageCalendar(user.role)}
      renderShopList={(shopId) => <ShopShoppingList shopId={shopId} limit={6} />}
    />
  );
}
