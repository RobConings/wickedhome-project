import type { GoodsAllocationInput, GoodsAllocationView } from "../types/goods-allocation";
import { api } from "@/lib/api-client";
import type { PurchaseDetail, PurchaseSummary } from "../types/purchases";
export const fetchPurchases = (query: { productId?: string; projectId?: string; requirementId?: string; shopId?: string } = {}) => api.get<PurchaseSummary[]>(`/purchases?${new URLSearchParams(Object.entries(query).flatMap(([key, value]) => value ? [[key, value]] : []))}`);
export const fetchPurchase = (id: string, kind: "visit" | "acquisition" = "visit") => api.get<PurchaseDetail>(`/purchases/${kind === "acquisition" ? "acquisitions/" : ""}${encodeURIComponent(id)}`);

export const saveGoodsAllocation = (id: string, input: GoodsAllocationInput) => api.put<GoodsAllocationView>(`/purchases/goods/${encodeURIComponent(id)}/allocation`, input);
