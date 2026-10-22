import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderKanbanIcon } from "lucide-react";
import { TagChip } from "@/components/shared/tag-chip";

const meta = {
  title: "Shared/TagChip",
  component: TagChip,
  args: { label: "Bathroom renovation", color: "#3b82b6" },
} satisfies Meta<typeof TagChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AsLink: Story = { args: { to: "/projects/p1", title: "Project: Bathroom renovation" } };

export const WithIcon: Story = { args: { icon: <FolderKanbanIcon />, to: "/projects/p1" } };

export const LongLabel: Story = { args: { label: "Christmas presents for the whole family and the neighbours" } };
