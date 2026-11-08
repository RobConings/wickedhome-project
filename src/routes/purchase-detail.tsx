import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { fetchPurchase, purchasesAction, PurchaseDetailScreen } from "@/features/purchases";
import { PurchasePaymentsPanel } from "@/features/shopping";
import { screenHandle } from "@/lib/screen-context";
export const loader = ({ params }: LoaderFunctionArgs) => fetchPurchase(params.purchaseId ?? params.acquisitionId ?? "", params.acquisitionId ? "acquisition" : "visit");
export const action = purchasesAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: data.kind === "visit" ? "purchase" : "acquisition", id: data.id, label: data.name ?? "Purchase" }));
export function Component() {
  const user = useCurrentUser();
  const purchase = useLoaderData<typeof loader>();
  return <PurchaseDetailScreen purchase={purchase} canAllocate={user.role !== "child"} payments={purchase.sessionId && user.role !== "child" ? <PurchasePaymentsPanel sessionId={purchase.sessionId} purchaseId={purchase.id} /> : undefined} />;
}
