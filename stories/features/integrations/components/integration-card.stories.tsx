import type { Meta, StoryObj } from "@storybook/react-vite";
import { HousePlugIcon, PlugIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationCard, IntegrationCardSkeleton } from "@/features/integrations/components/integration-card";
import { IntegrationSetupSteps } from "@/features/integrations/components/integration-setup-steps";

const meta = {
  title: "Features/Integrations/Components/IntegrationCard",
  component: IntegrationCard,
  decorators: [(Story) => <div className="w-[48rem] max-w-full">{Story()}</div>],
  args: {
    icon: HousePlugIcon,
    title: "Home Assistant",
    description: "Devices, energy statistics and the alarm from Home Assistant on the server.",
    status: "connected",
  },
} satisfies Meta<typeof IntegrationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = { args: { statusLabel: "Connected · 214 entities", actions: <Button variant="outline" size="sm">Settings</Button> } };
export const Disconnected: Story = { args: { status: "disconnected", actions: <Button size="sm">Connect</Button> } };
export const NeedsAttention: Story = { args: { status: "error", statusLabel: "Unreachable" } };

/** The frame every integration uses while the server lacks keys, with the setup steps. */
export const NotConfigured: Story = {
  args: {
    status: "not_configured",
    children: (
      <IntegrationSetupSteps
        intro="Set this up once on the server:"
        steps={[
          { kind: "command", command: "openssl rand -base64 32", hint: "Make a key…" },
          { kind: "env", name: "INTEGRATIONS_KEY", hint: "…and put it in .env." },
          { kind: "text", text: "Restart the app." },
        ]}
      />
    ),
  },
};

export const Loading: Story = { render: () => <IntegrationCardSkeleton icon={PlugIcon} title="Google" /> };
