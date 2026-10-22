import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { SolarInstallationFormDialog } from "@/features/energy/components/solar-installation-form-dialog";
import { solarFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/SolarInstallationFormDialog",
  component: SolarInstallationFormDialog,
  args: { trigger: <Button>Add solar panels</Button> },
} satisfies Meta<typeof SolarInstallationFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { installation: solarFixture, trigger: <Button variant="outline">Edit south roof</Button> } };
export const ValidationErrors: Story = {
  parameters: {
    router: { action: async () => ({ intent: "save-solar", errors: { panelWp: ["Too small: expected number to be >=50"] } }) },
  },
};
