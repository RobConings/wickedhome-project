import * as React from "react";
import { CheckIcon, CloudSunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "./card";
import { IconChip } from "./icon-chip";
import { InlineAlert } from "./inline-alert";
import { Spinner } from "@/components/ui/spinner";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/types/date-format";
import { WEATHER_SETTINGS_INTENT, type WeatherSettingsActionResult } from "../data/weather-requests";
import { WEATHER_PROVIDER_NAMES, type WeatherProviderId, type WeatherSettings } from "../types/weather";

type WeatherSettingsSectionProps = {
  settings: WeatherSettings;
  canManage: boolean;
};

/**
 * Settings section for the weather source: Open-Meteo (default), KMI/IRM or Google. Shows which provider
 * delivered the forecast last and when; Open-Meteo stands in automatically when the chosen one fails.
 */
export function WeatherSettingsSection({ settings, canManage }: WeatherSettingsSectionProps) {
  const { t } = useTranslation("weather");
  const fetcher = useFetcher<WeatherSettingsActionResult>({ key: WEATHER_SETTINGS_INTENT });
  const busy = fetcher.state !== "idle";
  // Optimistic: the clicked provider is selected while saving; rolls back if the save fails.
  const pending = fetcher.formData?.get("providerId") as WeatherProviderId | undefined;
  const selected = pending ?? settings.providerId;

  const handled = React.useRef<WeatherSettingsActionResult | undefined>(undefined);
  React.useEffect(() => {
    const result = fetcher.state === "idle" ? fetcher.data : undefined;
    if (!result || result === handled.current) return;
    handled.current = result;
    if (result.ok) toast.success(t("settings.saved"));
    else toast.error(result.formError ?? t("settings.failed"));
  }, [fetcher.state, fetcher.data, t]);

  const choose = (providerId: WeatherProviderId) => {
    if (providerId === settings.providerId || busy) return;
    void fetcher.submit({ intent: WEATHER_SETTINGS_INTENT, providerId }, { method: "post" });
  };
  const last = settings.last;

  return (
    <Card>
      <CardHeader className="items-center justify-start gap-3">
        <IconChip icon={CloudSunIcon} tone="info" size="sm" />
        <div className="flex flex-col gap-0.5">
          <CardTitle>{t("settings.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("settings.description")}</p>
        </div>
      </CardHeader>

      <div role="radiogroup" aria-label={t("settings.title")} className="flex flex-col gap-2">
        {settings.providers.map((provider) => {
          const active = selected === provider.id;
          const disabled = !canManage || !provider.available || busy;
          return (
            <button
              key={provider.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => choose(provider.id)}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active ? "border-primary bg-accent" : "hover:bg-accent/50",
                disabled && !active && "cursor-not-allowed opacity-60 hover:bg-transparent",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  active && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {active && (busy && pending === provider.id ? <Spinner className="size-3" /> : <CheckIcon className="size-3" aria-hidden="true" />)}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {provider.name}
                  {provider.id === "open-meteo" && <Badge variant="secondary">{t("settings.default")}</Badge>}
                  {provider.unofficial && <Badge variant="outline">{t("settings.unofficial")}</Badge>}
                  {!provider.available && <Badge variant="outline">{t("settings.notConfigured")}</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{t(`settings.providers.${provider.id}`)}</span>
                {!provider.available && <span className="text-xs text-muted-foreground">{t(`settings.howToConfigure.${provider.id}`)}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {last ? (
        last.fallbackFrom ? (
          <InlineAlert>
            {t("settings.lastFallback", {
              provider: WEATHER_PROVIDER_NAMES[last.provider],
              chosen: WEATHER_PROVIDER_NAMES[last.fallbackFrom],
              time: formatDateTime(last.fetchedAt, currentLocale()),
            })}
          </InlineAlert>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.last", {
              provider: WEATHER_PROVIDER_NAMES[last.provider],
              time: formatDateTime(last.fetchedAt, currentLocale()),
            })}
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t("settings.noneYet")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("settings.fallbackHint")}</p>
      {!canManage && <p className="text-sm text-muted-foreground">{t("settings.readOnly")}</p>}
    </Card>
  );
}
