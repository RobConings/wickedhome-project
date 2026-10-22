import type { Meta, StoryObj } from "@storybook/react-vite";
import { IntegrationSetupSteps } from "@/features/integrations/components/integration-setup-steps";

const meta = {
  title: "Features/Integrations/Components/IntegrationSetupSteps",
  component: IntegrationSetupSteps,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: {
    intro: "Google isn't set up on the server yet:",
    steps: [
      { kind: "command", command: "openssl rand -base64 32", hint: "Make an encryption key…" },
      { kind: "env", name: "INTEGRATIONS_KEY", hint: "…and put it in .env." },
      { kind: "text", text: "Create an OAuth client in Google Cloud." },
      { kind: "env", name: "GOOGLE_CLIENT_ID" },
      { kind: "env", name: "GOOGLE_CLIENT_SECRET" },
    ],
    outro: "Details: docs/INTEGRATIONS.md.",
  },
} satisfies Meta<typeof IntegrationSetupSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
