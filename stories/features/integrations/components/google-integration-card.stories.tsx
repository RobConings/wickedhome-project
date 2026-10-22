import type { Meta, StoryObj } from "@storybook/react-vite";
import { GoogleIntegrationCard } from "@/features/integrations/components/google-integration-card";
import {
  calendarOnlyGoogleFixture,
  connectedGoogleFixture,
  disconnectedGoogleFixture,
  fakeGoogleClient,
  needsReconnectGoogleFixture,
  notConfiguredGoogleFixture,
} from "../fixtures";

const meta = {
  title: "Features/Integrations/Components/GoogleIntegrationCard",
  component: GoogleIntegrationCard,
  decorators: [(Story) => <div className="w-[48rem] max-w-full">{Story()}</div>],
  args: { data: connectedGoogleFixture, client: fakeGoogleClient(connectedGoogleFixture) },
} satisfies Meta<typeof GoogleIntegrationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The server has no Google credentials yet: the owner's setup steps, with copyable names and commands. */
export const NotConfigured: Story = { args: { data: notConfiguredGoogleFixture, client: fakeGoogleClient(notConfiguredGoogleFixture) } };

/** Configured, not connected: each feature has its own Connect, asking Google only for that feature's access. */
export const Connect: Story = { args: { data: disconnectedGoogleFixture, client: fakeGoogleClient(disconnectedGoogleFixture) } };

/** Connected with every feature: calendars, publishing, mail suggestions and Drive. */
export const ConnectedWithScopes: Story = {};

/** Only Calendar granted: Gmail and Drive offer "Turn on" (incremental consent). */
export const CalendarOnly: Story = { args: { data: calendarOnlyGoogleFixture, client: fakeGoogleClient(calendarOnlyGoogleFixture) } };

/** Google refused the stored consent: reconnect. */
export const NeedsReconnect: Story = { args: { data: needsReconnectGoogleFixture, client: fakeGoogleClient(needsReconnectGoogleFixture) } };

/** The status couldn't load: Retry. */
export const LoadFailed: Story = { args: { data: null, client: fakeGoogleClient(connectedGoogleFixture) } };

/** Deferred loader data: a skeleton until it arrives. */
export const Loading: Story = { args: { data: new Promise(() => undefined) } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
