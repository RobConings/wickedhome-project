import type { Meta, StoryObj } from "@storybook/react-vite";
import { WeatherCard, WeatherCardSkeleton } from "@/features/weather/components/weather-card";
import {
  fallbackWeatherFixture,
  kmiWeatherFixture,
  noLocationWeatherFixture,
  rainingNowFixture,
  staleWeatherFixture,
  unavailableWeatherFixture,
  weatherFixture,
} from "../fixtures";

const meta = {
  title: "Features/Weather/Components/WeatherCard",
  component: WeatherCard,
  decorators: [(Story) => <div className="w-[24rem] max-w-full">{Story()}</div>],
  args: { weather: weatherFixture },
} satisfies Meta<typeof WeatherCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Dry evening, a shower expected around midnight. */
export const Default: Story = {};
/** From KMI: no feels-like temperature or gusts. */
export const FromKmi: Story = { args: { weather: kmiWeatherFixture } };
/** KMI failed; Open-Meteo stood in, said subtly in the footer. */
export const Fallback: Story = { args: { weather: fallbackWeatherFixture } };
export const RainingNow: Story = { args: { weather: rainingNowFixture } };
/** Open-Meteo couldn't be reached; an older forecast is shown. */
export const Stale: Story = { args: { weather: staleWeatherFixture } };
/** No address yet: points to Settings. */
export const NoLocation: Story = { args: { weather: noLocationWeatherFixture } };
export const Unavailable: Story = { args: { weather: unavailableWeatherFixture } };
export const FailedToLoad: Story = { args: { weather: null } };
export const Loading: Story = { render: () => <WeatherCardSkeleton /> };
