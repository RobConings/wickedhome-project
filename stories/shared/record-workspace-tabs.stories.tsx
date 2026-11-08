import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardTitle } from "@/components/shared/card";
import { RecordWorkspaceTabs } from "@/components/shared/record-workspace-tabs";

const meta = {
  title: "Shared/RecordWorkspaceTabs",
  component: RecordWorkspaceTabs,
  parameters: { layout: "padded" },
  args: {
    label: "Product sections",
    detailsLabel: "Details",
    overviewLabel: "Overview",
    details: <Card><CardTitle>Product details</CardTitle><p>Barcode, pack size, brand, shop and notes.</p></Card>,
    overview: <Card><CardTitle>Connected records</CardTitle><p>Shopping needs, recipes, purchases and alternatives.</p></Card>,
  },
} satisfies Meta<typeof RecordWorkspaceTabs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
