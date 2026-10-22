import { z } from "zod";
import { getHouseholdWeather } from "@/api/weather/weather.service";
import { registerAssistantSkill, registerAssistantTool } from "@ai/core/kit";

/** Skill "weather": the forecast at home (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "weather",
  title: { en: "Weather", nl: "Weer" },
  summary: "Weather at home now, the next hours and days: temperature, rain, wind.",
  keywords: {
    nl: ["weer", "het weer", "weersverwachting", "weerbericht", "regen", "regenen", "temperatuur", "graden", "wind", "zon", "sneeuw", "vriezen", "paraplu", "warm", "koud"],
    en: ["weather", "forecast", "rain", "temperature", "degrees", "wind", "sunny", "snow", "freeze", "umbrella", "warm", "cold"],
  },
});

registerAssistantTool({
  name: "weather.forecast",
  description: "Weather at home now, the next hours and the coming days (°C, rain in mm and chance %, wind km/h, sunrise/sunset). Today/tomorrow: days 2; the week: days 7.",
  input: z.object({
    days: z.number().int().min(1).max(7).default(3).describe("How many days of forecast, default 3"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the weather", nl: "Weer bekeken" },
  run: async (ctx, input) => {
    const response = await getHouseholdWeather(ctx.householdId);
    if (response.status === "no_location") return { available: false, hint: "Set the home address in Settings first." };
    if (response.status !== "ok") return { available: false, hint: "The weather service could not be reached." };
    const { current, hours, days, stale } = response.forecast;
    return {
      stale: stale || null,
      now: { temperature: current.temperature, feelsLike: current.apparentTemperature, condition: current.condition, humidity: current.humidity, windKmh: current.windSpeed, gustsKmh: current.windGusts },
      nextHours: hours.slice(0, 12).map((hour) => `${hour.time.slice(11, 16)} ${hour.temperature}° ${hour.condition} rain ${hour.precipitationProbability ?? 0}%/${hour.precipitation ?? 0}mm`),
      days: days.slice(0, input.days).map((entry) => ({
        date: entry.date,
        condition: entry.condition,
        min: entry.temperatureMin,
        max: entry.temperatureMax,
        rainMm: entry.precipitationSum,
        rainChance: entry.precipitationProbability,
        windMaxKmh: entry.windSpeedMax,
        sun: entry.sunrise && entry.sunset ? `${entry.sunrise.slice(11, 16)}–${entry.sunset.slice(11, 16)}` : null,
      })),
    };
  },
});
