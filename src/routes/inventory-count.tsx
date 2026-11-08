import { data, Navigate, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { StocktakeScreen, canManageStock, inventoryLoader } from "@/features/inventory";
import { screenHandle } from "@/lib/screen-context";
export async function loader({ request }: LoaderFunctionArgs) {
  const page = await inventoryLoader();
  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) return page;
  const product = page.products.find((item) => item.id === productId);
  if (!product) throw data(null, { status: 404 });
  const ownerId = product.stockProductId ?? product.id;
  return { ...page, stock: page.stock.filter((item) => item.productId === ownerId) };
}
export const handle = screenHandle(({ t }) => ({ kind: "inventory", label: t("inventory:count.title") }));
export function Component() {
  const user = useCurrentUser();
  const data = useLoaderData<typeof loader>();
  if (!canManageStock(user.role)) return <Navigate to="/inventory" replace />;
  return <StocktakeScreen items={data.stock} images={Object.fromEntries(data.products.map((product) => [product.id, product.imageUrl]))} />;
}
