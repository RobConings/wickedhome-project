import type { WasteProviderId, WasteProviderInfo } from "@/features/waste/types/waste";
import { limburgNetProvider } from "./limburg-net";
import type { WasteProvider } from "./provider";
import { recycleAppProvider } from "./recycle-app";

/**
 * Every supported waste collector. Order matters for suggestions: providers with a fixed postal-code
 * range first, the general platform (Recycle!) last. Adding a provider: docs/WASTE-WEATHER.md.
 */
export const WASTE_PROVIDERS: Record<WasteProviderId, WasteProvider> = {
  "limburg-net": limburgNetProvider,
  "recycle-app": recycleAppProvider,
};

export const wasteProviderInfos = (): WasteProviderInfo[] => Object.values(WASTE_PROVIDERS).map((provider) => provider.info);

export const wasteProvider = (id: string): WasteProvider | null =>
  Object.hasOwn(WASTE_PROVIDERS, id) ? WASTE_PROVIDERS[id as WasteProviderId] : null;

export type { ProviderCollection, WasteProvider } from "./provider";
