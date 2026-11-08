import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { fetchPurchases, PurchasesScreen } from "@/features/purchases";
import { screenHandle } from "@/lib/screen-context";
export async function loader({ request }: LoaderFunctionArgs) {
  const query = new URL(request.url).searchParams;
  const filter = { productId: query.get("productId") ?? undefined, projectId: query.get("projectId") ?? undefined };
  return { purchases: await fetchPurchases(filter), filtered: Boolean(filter.productId || filter.projectId) };
}
export const handle = screenHandle(({ t }) => ({ kind: "purchases", label: t("nav.purchases") }));
export function Component() { return <PurchasesScreen {...useLoaderData<typeof loader>()} />; }
