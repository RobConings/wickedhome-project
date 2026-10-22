import type { Meta, StoryObj } from "@storybook/react-vite";
import { HousePlugIcon } from "lucide-react";
import { GoogleIntegrationCard } from "@/features/integrations/components/google-integration-card";
import { IntegrationCard } from "@/features/integrations/components/integration-card";
import { IntegrationsScreen } from "@/features/integrations/screens/integrations-screen";
import { connectedGoogleFixture, fakeGoogleClient, notConfiguredGoogleFixture } from "../fixtures";

const meta = {
  title: "Features/Integrations/Screens/IntegrationsScreen",
  component: IntegrationsScreen,
  args: { children: null },
} satisfies Meta<typeof IntegrationsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const otherCard = (
  <IntegrationCard icon={HousePlugIcon} title="Home Assistant" description="Composed by the route like every other card." status="disconnected" />
);

export const Default: Story = {
  args: {
    children: (
      <>
        <GoogleIntegrationCard data={connectedGoogleFixture} client={fakeGoogleClient(connectedGoogleFixture)} />
        {otherCard}
      </>
    ),
  },
};

/** Nothing configured on the server yet. */
export const NotConfigured: Story = {
  args: {
    children: (
      <>
        <GoogleIntegrationCard data={notConfiguredGoogleFixture} client={fakeGoogleClient(notConfiguredGoogleFixture)} />
        {otherCard}
      </>
    ),
  },
};

/** Cards waiting for their deferred data. */
export const Loading: Story = { args: { children: <GoogleIntegrationCard data={new Promise(() => undefined)} /> } };

export const Mobile: Story = { ...Default, globals: { viewport: { value: "mobile1" } } };
