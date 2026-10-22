import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudSunIcon } from "lucide-react";
import { Card } from "@/components/shared/card";
import { IconCardHeader } from "@/components/shared/icon-card-header";

const meta = {
  title: "Shared/IconCardHeader",
  component: IconCardHeader,
  parameters: { layout: "padded" },
  args: { icon: CloudSunIcon, tone: "info", title: "Weather" },
  decorators: [(Story) => <Card>{Story()}</Card>],
} satisfies Meta<typeof IconCardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithDescription: Story = { args: { description: "Where the forecast comes from." } };
