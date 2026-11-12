import { api } from "@/lib/api-client";
import type { XtraCredentials, XtraSearchResult, XtraStatus } from "../types/xtra";

export const xtraClient = {
  status: () => api.get<XtraStatus>("/shopping/xtra/status"),
  connect: (credentials: XtraCredentials, userIds: string[]) => api.post<XtraStatus>("/shopping/xtra/connection", { credentials, userIds }),
  access: (userIds: string[]) => api.put<XtraStatus>("/shopping/xtra/access", { userIds }),
  check: () => api.post<XtraStatus>("/shopping/xtra/check"),
  disconnect: () => api.delete("/shopping/xtra/connection"),
  search: (query: string) => api.get<XtraSearchResult>(`/shopping/xtra/products?${new URLSearchParams({ query })}`),
};
