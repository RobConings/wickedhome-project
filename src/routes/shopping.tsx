import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import {
  ShoppingScreen,
  canManageShopping,
  shoppingAction,
  shoppingLoader,
  shoppingShouldRevalidate,
} from "@/features/shopping";
import { screenHandle } from "./lib/screen-context";

export const loader = shoppingLoader;
export const action = shoppingAction;
export const handle = screenHandle(({ t }) => ({ kind: "shopping", label: t("nav.shopping") }));
export const shouldRevalidate = shoppingShouldRevalidate;

export function Component() {
  const user = useCurrentUser();
  return <ShoppingScreen data={useLoaderData<typeof shoppingLoader>()} canManage={canManageShopping(user.role)} />;
}
