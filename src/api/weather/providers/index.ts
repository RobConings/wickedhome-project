import type { WeatherProviderId, WeatherProviderInfo } from "@/features/weather/types/weather";
import { googleProvider } from "./google";
import { kmiProvider } from "./kmi";
import { openMeteoProvider } from "./open-meteo";
import type { WeatherProvider } from "./provider";

/** Every weather source. Open-Meteo is the default and the fallback. Adding one: docs/WASTE-WEATHER.md. */
export const WEATHER_PROVIDERS: Record<WeatherProviderId, WeatherProvider> = {
  "open-meteo": openMeteoProvider,
  kmi: kmiProvider,
  google: googleProvider,
};

export function weatherProviderInfos(): WeatherProviderInfo[] {
  return Object.values(WEATHER_PROVIDERS).map((provider) => {
    const available = provider.isConfigured();
    return { ...provider.info, available, unavailableReason: available ? null : "not_configured" };
  });
}

export type { ProviderForecast, WeatherProvider } from "./provider";
