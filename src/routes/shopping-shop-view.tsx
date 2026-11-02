import { useLoaderData, useParams } from "react-router";
import { ShopViewScreen, canManageShopping, shoppingAction, shoppingLoader, shoppingShouldRevalidate } from "@/features/shopping";
import { useCurrentUser } from "@/features/auth";
import { screenHandle } from "@/lib/screen-context";

export const loader = shoppingLoader;
export const action = shoppingAction;
export const handle = screenHandle(({ t }) => ({ kind: "shopping", label: t("screen.shopView") }));
export const shouldRevalidate = shoppingShouldRevalidate;

export function Component() {
  const { shopId } = useParams();
  const user = useCurrentUser();
  return <ShopViewScreen data={useLoaderData<typeof shoppingLoader>()} shopKey={shopId ?? null} canManage={canManageShopping(user.role)} />;
}
