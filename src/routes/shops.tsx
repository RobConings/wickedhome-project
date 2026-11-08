import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ShopsScreen, canAddShops, shopsAction, shopsLoader, fetchShopGroups } from "@/features/shops";
import { screenHandle } from "@/lib/screen-context";

export const loader = async () => { const [shops, groups] = await Promise.all([shopsLoader(), fetchShopGroups()]); return { shops, groups }; };
export const action = shopsAction;
export const handle = screenHandle(({ t }) => ({ kind: "shops", label: t("nav.shops") }));

export function Component() {
  const user = useCurrentUser();
  const { shops, groups } = useLoaderData<typeof loader>();
  return <ShopsScreen shops={shops} groups={groups} canAdd={canAddShops(user.role)} />;
}
