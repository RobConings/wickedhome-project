import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ProductStockScreen, canManageStock, inventoryAction, productStockLoader } from "@/features/inventory";
import { screenHandle } from "./lib/screen-context";

export const loader = productStockLoader;
export const action = inventoryAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "product", id: data.product.id, label: data.product.name }));

export function Component() {
  const user = useCurrentUser();
  const data = useLoaderData<typeof productStockLoader>();
  return <ProductStockScreen key={data.product.id} data={data} canManage={canManageStock(user.role)} />;
}
