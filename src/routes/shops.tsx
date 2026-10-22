import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ShopsScreen, canAddShops, shopsAction, shopsLoader } from "@/features/shops";
import { screenHandle } from "./lib/screen-context";

export const loader = shopsLoader;
export const action = shopsAction;
export const handle = screenHandle(({ t }) => ({ kind: "shops", label: t("nav.shops") }));

export function Component() {
  const user = useCurrentUser();
  return <ShopsScreen shops={useLoaderData<typeof shopsLoader>()} canAdd={canAddShops(user.role)} />;
}
