import { api } from "@/lib/api-client";
import type { PairingSession, ProviderSelection, ProviderStatus } from "../types/providers";
export const providerClient = {
  status: (accountId?: string) => api.get<ProviderStatus>(`/assistant/provider${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`),
  select: (input: ProviderSelection) => api.post<ProviderStatus>("/assistant/provider", input),
  pair: (newAccount = false, accountId?: string) => api.post<PairingSession>("/assistant/provider/pairing", { newAccount, accountId }),
  acknowledgePlan: () => api.post("/assistant/provider/notice"),
  cancelPair: () => api.delete("/assistant/provider/pairing"),
  disconnect: (accountId?: string) => api.delete<{ remoteRevoked: boolean }>(`/assistant/provider${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`),
};
