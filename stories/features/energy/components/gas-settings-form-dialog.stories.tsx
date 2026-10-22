import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { GasSettingsFormDialog } from "@/features/energy/components/gas-settings-form-dialog";
import { gasSettingsFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/GasSettingsFormDialog",
  component: GasSettingsFormDialog,
  args: { settings: gasSettingsFixture, trigger: <Button variant="outline">Edit gas connection</Button> },
} satisfies Meta<typeof GasSettingsFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ValidationErrors: Story = {
  parameters: {
    router: {
      action: async () => ({ intent: "save-gas-settings", errors: { gasCalorificKwhPerM3: ["Too small: expected number to be >=8"] } }),
    },
  },
};
