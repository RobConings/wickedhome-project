import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { BatteryFormDialog } from "@/features/energy/components/battery-form-dialog";
import { batteryFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/BatteryFormDialog",
  component: BatteryFormDialog,
  args: { trigger: <Button>Add battery</Button> },
} satisfies Meta<typeof BatteryFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { battery: batteryFixture, trigger: <Button variant="outline">Edit battery</Button> } };
