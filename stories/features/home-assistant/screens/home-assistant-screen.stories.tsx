import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeAssistantScreen } from "@/features/home-assistant/screens/home-assistant-screen";
import { alarmOverview, appliancesFixture, connectedStatus, energyFixture, entitiesFixture, notConfiguredStatus, suggestionsFixture } from "../fixtures";

const never = <T,>() => new Promise<T>(() => undefined);

const meta = {
  title: "Features/HomeAssistant/Screens/HomeAssistantScreen",
  component: HomeAssistantScreen,
  parameters: { layout: "fullscreen" },
  args: {
    status: connectedStatus,
    entities: { status: connectedStatus, entities: entitiesFixture },
    suggestions: { status: connectedStatus, suggestions: suggestionsFixture },
    energy: energyFixture,
    alarm: alarmOverview(),
    appliances: appliancesFixture,
    canManage: true,
    live: false,
  },
} satisfies Meta<typeof HomeAssistantScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
/** Before the owner sets it up: only the card with the setup steps. */
export const NotConfigured: Story = { args: { status: notConfiguredStatus } };
/** The deferred parts loading: skeletons per section, the status card already there. */
export const Loading: Story = {
  args: { entities: never(), suggestions: never(), energy: never(), alarm: never(), appliances: never() },
};
/** Children: status, alarm state and energy; no import, entities or log. */
export const AsChild: Story = { args: { canManage: false } };
