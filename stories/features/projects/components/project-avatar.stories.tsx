import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectAvatar } from "@/features/projects/components/project-icon";
import { PROJECT_COLORS, PROJECT_ICONS } from "@/features/projects/types/projects";

const meta = {
  title: "Features/Projects/Components/ProjectAvatar",
  component: ProjectAvatar,
  args: { project: { icon: "bath", color: "#3b82b6" }, size: "md" },
} satisfies Meta<typeof ProjectAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { size: "lg" } };

export const AllIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {PROJECT_ICONS.map((icon, index) => (
        <ProjectAvatar key={icon} project={{ icon, color: PROJECT_COLORS[index % PROJECT_COLORS.length] ?? "#124734" }} />
      ))}
    </div>
  ),
};
