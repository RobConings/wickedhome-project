import { Navigate, useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { StocktakeScreen, canManageStock, inventoryLoader } from "@/features/inventory";
import { screenHandle } from "@/lib/screen-context";
export const loader = inventoryLoader;
export const handle = screenHandle(({ t }) => ({ kind: "inventory", label: t("inventory:count.title") }));
export function Component() {
  const user = useCurrentUser();
  const data = useLoaderData<typeof loader>();
  if (!canManageStock(user.role)) return <Navigate to="/inventory" replace />;
  return <StocktakeScreen items={data.stock} images={Object.fromEntries(data.products.map((product) => [product.id, product.imageUrl]))} />;
}
