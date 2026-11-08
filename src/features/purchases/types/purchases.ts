import type { GoodsAllocationView } from "./goods-allocation";
export type PurchaseSummary = {
  id: string; kind: "visit" | "acquisition"; name: string | null; purchasedAt: string;
  sessionId: string | null; shopName: string | null; lineCount: number; receiptCount: number;
  totalCents: number | null; linkedPaidCents: number | null; canReadMoney: boolean;
};
export type PurchaseLine = {
  allocation: GoodsAllocationView;
  id: string; productId: string | null; stockProductId: string; name: string | null;
  catalogueProductId: string | null;
  quantity: number; unit: string | null; stockAdded: boolean;
  stockQuantity: number; stockUnit: string | null; stockItemId: string;
  sessionItemId: string | null; requirementIds: string[];
};
export type PurchaseDetail = PurchaseSummary & {
  lines: PurchaseLine[];
  receipts: { id: string; documentId: string | null; name: string; purchasedAt: string; totalCents: number | null }[];
  expenses: { id: string; name: string; amountCents: number; paidOn: string | null }[];
};
export const purchasePath = (row: Pick<PurchaseSummary, "id" | "kind">) => row.kind === "visit"
  ? `/purchases/${encodeURIComponent(row.id)}` : `/purchases/acquisitions/${encodeURIComponent(row.id)}`;
