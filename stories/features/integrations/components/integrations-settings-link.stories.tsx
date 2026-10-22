import type { Meta, StoryObj } from "@storybook/react-vite";
import { IntegrationsSettingsLink } from "@/features/integrations/components/integrations-settings-link";

const meta = {
  title: "Features/Integrations/Components/IntegrationsSettingsLink",
  component: IntegrationsSettingsLink,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
} satisfies Meta<typeof IntegrationsSettingsLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Settings section that points to the Integrations page. */
export const Default: Story = {};
