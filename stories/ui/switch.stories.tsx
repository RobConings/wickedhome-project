import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const meta = {
  title: "UI/Switch",
  component: Switch,
  args: { "aria-label": "Enabled" },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Switch id="daily-sync" defaultChecked />
      <Label htmlFor="daily-sync">Sync every morning</Label>
    </div>
  ),
};
