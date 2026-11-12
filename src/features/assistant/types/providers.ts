import { z } from "zod";
export const providerSelectionSchema = z.object({ provider: z.enum(["local", "chatgpt_subscription"]), model: z.string().min(1).max(160).optional(), accountId: z.string().min(1).max(200).optional() });
export type ProviderSelection = z.infer<typeof providerSelectionSchema>;
export type ProviderStatus = {
  provider: ProviderSelection["provider"];
  model: string | null;
  connected: boolean;
  permission: boolean;
  storageReady: boolean;
  accountId: string | null;
  accounts: { id: string; email: string | null; connected: boolean }[];
  models: { slug: string; displayName: string }[];
  local: { configured: boolean; model: string | null };
  usageUrl: string;
  error: string | null;
  needsPlanNotice?: boolean;
};
export type PairingSession = { code: string; expiresAt: string; server: string };
