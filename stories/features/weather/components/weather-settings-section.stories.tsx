import type { Meta, StoryObj } from "@storybook/react-vite";
import { WeatherSettingsSection } from "@/features/weather/components/weather-settings-section";
import { fallbackWeatherSettingsFixture, weatherSettingsFixture } from "../fixtures";

const meta = {
  title: "Features/Weather/Components/WeatherSettingsSection",
  component: WeatherSettingsSection,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { settings: weatherSettingsFixture, canManage: true },
} satisfies Meta<typeof WeatherSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** KMI chosen; Google isn't configured on the server, so it can't be picked. */
export const Default: Story = {};
/** The chosen provider failed last time; Open-Meteo stood in. */
export const AfterFallback: Story = { args: { settings: fallbackWeatherSettingsFixture } };
export const NothingFetchedYet: Story = { args: { settings: { ...weatherSettingsFixture, providerId: "open-meteo", last: null } } };
export const ReadOnly: Story = { args: { canManage: false } };
/** Switching provider: the choice shows at once with a spinner until saved. */
export const Saving: Story = { parameters: { router: { action: () => new Promise(() => undefined) } } };
