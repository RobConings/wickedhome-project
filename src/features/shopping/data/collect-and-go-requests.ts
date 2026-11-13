import type { CollectAndGoActivity } from "../types/collect-and-go-activity";
import { api } from "@/lib/api-client";
import type { CollectAndGoCart, CollectAndGoOrderDetail, CollectAndGoOrders, CollectAndGoStatus } from "../types/collect-and-go";
export const collectAndGoClient = {
  activity: () => api.get<CollectAndGoActivity>("/shopping/collect-and-go/activity"),
  status: () => api.get<CollectAndGoStatus>("/shopping/collect-and-go/status"),
  cart: () => api.get<CollectAndGoCart>("/shopping/collect-and-go/cart"),
  orders: () => api.get<CollectAndGoOrders>("/shopping/collect-and-go/orders"),
  order: (id: string) => api.get<CollectAndGoOrderDetail>(`/shopping/collect-and-go/orders/${encodeURIComponent(id)}`),
};
