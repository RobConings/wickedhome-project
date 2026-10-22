import {
  CloudDrizzleIcon,
  CloudFogIcon,
  CloudHailIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudMoonIcon,
  CloudMoonRainIcon,
  CloudRainIcon,
  CloudRainWindIcon,
  CloudSnowIcon,
  CloudSunIcon,
  CloudSunRainIcon,
  MoonIcon,
  MoonStarIcon,
  SnowflakeIcon,
  SunIcon,
  SunMediumIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeatherCondition } from "../types/weather";

/** Day and night icon per condition. */
const ICONS: Record<WeatherCondition, [day: LucideIcon, night: LucideIcon]> = {
  clear: [SunIcon, MoonIcon],
  mostly_clear: [SunMediumIcon, MoonStarIcon],
  partly_cloudy: [CloudSunIcon, CloudMoonIcon],
  overcast: [CloudIcon, CloudIcon],
  fog: [CloudFogIcon, CloudFogIcon],
  drizzle: [CloudDrizzleIcon, CloudDrizzleIcon],
  freezing_drizzle: [CloudDrizzleIcon, CloudDrizzleIcon],
  rain: [CloudRainIcon, CloudRainIcon],
  heavy_rain: [CloudRainWindIcon, CloudRainWindIcon],
  freezing_rain: [CloudHailIcon, CloudHailIcon],
  rain_showers: [CloudSunRainIcon, CloudMoonRainIcon],
  sleet: [CloudHailIcon, CloudHailIcon],
  snow: [CloudSnowIcon, CloudSnowIcon],
  snow_showers: [SnowflakeIcon, SnowflakeIcon],
  thunderstorm: [CloudLightningIcon, CloudLightningIcon],
  thunderstorm_hail: [CloudLightningIcon, CloudLightningIcon],
  unknown: [CloudIcon, CloudIcon],
};

type WeatherIconProps = {
  condition: WeatherCondition;
  isDay?: boolean;
  className?: string;
  /** Accessible label; without it the icon is decorative. */
  label?: string;
};

/** The icon for a weather condition, with a night variant where it makes sense. */
export function WeatherIcon({ condition, isDay = true, className, label }: WeatherIconProps) {
  const Icon = ICONS[condition][isDay ? 0 : 1];
  return (
    <Icon
      className={cn("size-5 shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
