import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { ApplianceFormDialog } from "@/features/energy/components/appliance-form-dialog";
import { applianceFixtures, energyPlaceFixtures } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/ApplianceFormDialog",
  component: ApplianceFormDialog,
  args: { places: energyPlaceFixtures, trigger: <Button>Add appliance</Button> },
} satisfies Meta<typeof ApplianceFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = {
  args: { appliance: applianceFixtures.jacuzzi, trigger: <Button variant="outline">Edit jacuzzi</Button> },
};
export const NoPlacesYet: Story = { args: { places: [] } };
export const ValidationErrors: Story = {
  parameters: {
    router: {
      action: async () => ({ intent: "save", errors: { name: ["Too small: expected string to have >=1 characters"] } }),
    },
  },
};
export const EditGasBoiler: Story = {
  args: { appliance: applianceFixtures.boiler, trigger: <Button variant="outline">Edit gas boiler</Button> },
};
