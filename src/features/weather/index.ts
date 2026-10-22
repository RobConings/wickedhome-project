// Public API of the weather feature. Routes, the app frame and other features import from here only.
// The forecast comes from GET /api/weather for the household's location, from the chosen provider
// (Open-Meteo, KMI/IRM or Google; src/api/weather/providers), cached server-side.
export { WeatherCard, WeatherCardSkeleton } from "./components/weather-card";
export { WeatherIcon } from "./components/weather-icon";
export { WeatherSettingsSection } from "./components/weather-settings-section";
export {
  WEATHER_SETTINGS_INTENT,
  fetchWeather,
  fetchWeatherSettings,
  submitWeatherSettings,
  type WeatherSettingsActionResult,
} from "./data/weather-requests";
export {
  canManageWeather,
  type WeatherCondition,
  type WeatherForecast,
  type WeatherProviderId,
  type WeatherResponse,
  type WeatherSettings,
} from "./types/weather";
