import type { Meta, StoryObj } from "@storybook/react-vite";
import { WeatherIcon } from "@/features/weather/components/weather-icon";
import { WEATHER_CONDITIONS } from "@/features/weather/types/weather";

const meta = {
  title: "Features/Weather/Components/WeatherIcon",
  component: WeatherIcon,
  args: { condition: "partly_cloudy", isDay: true, className: "size-8" },
} satisfies Meta<typeof WeatherIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Night: Story = { args: { isDay: false } };
/** Every condition, by day and by night. */
export const AllConditions: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-4 text-xs">
      {WEATHER_CONDITIONS.map((condition) => (
        <div key={condition} className="flex items-center gap-2">
          <WeatherIcon condition={condition} className="size-6" />
          <WeatherIcon condition={condition} isDay={false} className="size-6 text-muted-foreground" />
          <span>{condition}</span>
        </div>
      ))}
    </div>
  ),
};
