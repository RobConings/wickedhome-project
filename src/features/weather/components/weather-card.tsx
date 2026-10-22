import type * as React from "react";
import { ArrowRightIcon, CloudSunIcon, DropletsIcon, MapPinIcon, UmbrellaIcon, WindIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
import { InlineAlert } from "@/components/shared/inline-alert";
import { intlLocale } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatWeekday } from "@/types/date-format";
import {
  WEATHER_ATTRIBUTIONS,
  WEATHER_PROVIDER_NAMES,
  rainOutlook,
  windCompass,
  type WeatherForecast,
  type WeatherResponse,
} from "../types/weather";
import { WeatherIcon } from "./weather-icon";

type WeatherCardProps = {
  /** `null` when the request failed. */
  weather: WeatherResponse | null;
  /** How many hours and days to show. */
  hours?: number;
  days?: number;
};

const hourOf = (time: string) => time.slice(11, 16);

function CardShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useTranslation("weather");
  return (
    <Card>
      <CardHeader className="items-center justify-start gap-3">
        <IconChip icon={CloudSunIcon} tone="info" size="sm" />
        <CardTitle>{t("card.title")}</CardTitle>
      </CardHeader>
      {children}
      {footer}
    </Card>
  );
}

function Forecast({ forecast, hours, days }: { forecast: WeatherForecast; hours: number; days: number }) {
  const { t } = useTranslation("weather");
  const locale = currentLocale();
  const mm = (value: number) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value);
  const degrees = (value: number) => `${Math.round(value)}°`;
  /** Compact column label of a forecast day: "za" / "Sat". */
  const weekday = (date: string) => formatWeekday(date, locale, "short");
  const { current } = forecast;
  const today = forecast.days[0];
  const outlook = rainOutlook(forecast.hours);
  const condition = (code: WeatherForecast["current"]["condition"]) => t(`conditions.${code}`);

  const rainText =
    outlook.kind === "dry"
      ? t("rain.dry", { hours: forecast.hours.length })
      : outlook.kind === "now"
        ? outlook.until
          ? t("rain.nowUntil", { time: hourOf(outlook.until), amount: mm(outlook.total) })
          : t("rain.nowAllDay", { amount: mm(outlook.total) })
        : t("rain.later", { time: hourOf(outlook.from), amount: mm(outlook.total) });

  return (
    <>
      <div className="flex items-center gap-4">
        <WeatherIcon condition={current.condition} isDay={current.isDay} className="size-12 text-info" />
        <div className="flex min-w-0 flex-col">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{degrees(current.temperature)}</span>
          <span className="text-sm text-muted-foreground">
            {condition(current.condition)}
            {current.apparentTemperature !== null && ` · ${t("feelsLike", { temperature: degrees(current.apparentTemperature) })}`}
          </span>
        </div>
        {today && (
          <div className="ml-auto flex flex-col items-end text-sm tabular-nums">
            <span className="font-medium">{t("max", { temperature: degrees(today.temperatureMax) })}</span>
            <span className="text-muted-foreground">{t("min", { temperature: degrees(today.temperatureMin) })}</span>
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-center gap-2">
          <UmbrellaIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={outlook.kind === "dry" ? undefined : "font-medium"}>{rainText}</span>
        </li>
        {today && (
          <li className="flex items-center gap-2">
            <DropletsIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {today.precipitationProbability === null
                ? t("today.amount", { amount: mm(today.precipitationSum) })
                : t("today.chance", { chance: today.precipitationProbability, amount: mm(today.precipitationSum) })}
            </span>
          </li>
        )}
        <li className="flex items-center gap-2">
          <WindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            {t(current.windGusts === null ? "windNoGusts" : "wind", {
              speed: current.windSpeed,
              direction: t(`compass.${windCompass(current.windDirection)}`),
              gusts: current.windGusts,
            })}
          </span>
        </li>
      </ul>

      <ol aria-label={t("hours.label")} className="grid grid-cols-6 gap-1 border-t pt-3 text-center text-xs">
        {forecast.hours.slice(0, hours).map((hour) => (
          <li key={hour.time} className="flex flex-col items-center gap-1">
            <span className="text-muted-foreground tabular-nums">{hourOf(hour.time)}</span>
            <WeatherIcon condition={hour.condition} isDay={hour.isDay} label={condition(hour.condition)} className="size-5" />
            <span className="font-medium tabular-nums">{degrees(hour.temperature)}</span>
            <span className="text-info tabular-nums">
              {hour.precipitationProbability ? `${hour.precipitationProbability}%` : " "}
            </span>
          </li>
        ))}
      </ol>

      <ol aria-label={t("days.label")} className="flex flex-col divide-y border-t text-sm">
        {forecast.days.slice(1, days + 1).map((day) => (
          <li key={day.date} className="flex items-center gap-3 py-1.5">
            <span className="w-10 text-muted-foreground capitalize">{weekday(day.date)}</span>
            <WeatherIcon condition={day.condition} label={condition(day.condition)} className="size-5" />
            <span className="w-12 text-xs text-info tabular-nums">
              {day.precipitationProbability ? `${day.precipitationProbability}%` : ""}
            </span>
            <span className="ml-auto tabular-nums">
              <span className="text-muted-foreground">{degrees(day.temperatureMin)}</span>
              {" / "}
              <span className="font-medium">{degrees(day.temperatureMax)}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * The home's weather: now, today's range, rain in the next hours, wind, the next hours and days. Asks for
 * the address (in Settings) when the household has no location yet.
 */
export function WeatherCard({ weather, hours = 6, days = 5 }: WeatherCardProps) {
  const { t } = useTranslation("weather");

  if (!weather) {
    return (
      <CardShell>
        <InlineAlert tone="error">{t("card.loadError")}</InlineAlert>
      </CardShell>
    );
  }

  if (weather.status === "no_location") {
    return (
      <CardShell
        footer={
          <CardFooter>
            <Button asChild variant="link" size="sm" className="px-0">
              <Link to="/settings#household">
                {t("card.setAddress")}
                <ArrowRightIcon />
              </Link>
            </Button>
          </CardFooter>
        }
      >
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{t("card.noLocation")}</p>
        </div>
      </CardShell>
    );
  }

  if (weather.status === "unavailable") {
    return (
      <CardShell>
        <InlineAlert tone="error">{t("card.unavailable")}</InlineAlert>
      </CardShell>
    );
  }

  return (
    <CardShell
      footer={
        <CardFooter className="flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {weather.forecast.stale && <span>{t("card.stale")}</span>}
          <span>
            {t("card.attribution")}{" "}
            <a
              href={WEATHER_ATTRIBUTIONS[weather.forecast.provider].url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {WEATHER_ATTRIBUTIONS[weather.forecast.provider].label}
            </a>
            {weather.forecast.fallbackFrom && ` ${t("card.fallback", { provider: WEATHER_PROVIDER_NAMES[weather.forecast.fallbackFrom] })}`}
          </span>
        </CardFooter>
      }
    >
      <Forecast forecast={weather.forecast} hours={hours} days={days} />
    </CardShell>
  );
}

/** The card's shape while the forecast loads. */
export function WeatherCardSkeleton() {
  const { t } = useTranslation("weather");
  return (
    <Card aria-busy="true">
      <CardHeader className="items-center justify-start gap-3">
        <IconChip icon={CloudSunIcon} tone="info" size="sm" />
        <CardTitle>{t("card.title")}</CardTitle>
        <span className="sr-only" role="status">
          {t("card.loading")}
        </span>
      </CardHeader>
      <div aria-hidden className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton aria-hidden className="h-16 w-full" />
      <div aria-hidden className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    </Card>
  );
}
