import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeAssistantIntegrationCard } from "@/features/home-assistant/components/home-assistant-integration-card";
import { HA_NOW, authErrorStatus, connectedStatus, connectingStatus, notConfiguredStatus, otherHouseholdStatus, unreachableStatus } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/HomeAssistantIntegrationCard",
  component: HomeAssistantIntegrationCard,
  args: { status: connectedStatus, canManage: true, live: false, now: HA_NOW, className: "w-[30rem] max-w-full" },
} satisfies Meta<typeof HomeAssistantIntegrationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Connected: version, entity count, last event, "Test connection" and the link to the Home Assistant page. */
export const Connected: Story = {};
/** Not configured yet: the owner's setup steps (token, .env, restart). */
export const NotConfigured: Story = { args: { status: notConfiguredStatus } };
export const Connecting: Story = { args: { status: connectingStatus } };
/** The token was rejected: what to do, and when it retries. */
export const TokenRejected: Story = { args: { status: authErrorStatus } };
export const Unreachable: Story = { args: { status: unreachableStatus } };
/** Several households on one server without HOME_ASSISTANT_HOUSEHOLD_ID pointing at this one. */
export const OtherHousehold: Story = { args: { status: otherHouseholdStatus } };
/** Children see the status but can't test. */
export const AsChild: Story = { args: { canManage: false } };
/** Loading its own status (no status given, not live): the skeleton. */
export const Loading: Story = { args: { status: undefined } };
