import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { InventoryScreen, canManageStock, inventoryAction, inventoryLoader } from "@/features/inventory";
import { screenHandle } from "./lib/screen-context";

export const loader = inventoryLoader;
export const action = inventoryAction;
export const handle = screenHandle(({ t }) => ({ kind: "inventory", label: t("nav.inventory") }));

export function Component() {
  const user = useCurrentUser();
  return <InventoryScreen data={useLoaderData<typeof inventoryLoader>()} canManage={canManageStock(user.role)} />;
}
