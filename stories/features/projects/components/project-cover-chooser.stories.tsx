import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectCoverChooser } from "@/features/projects/components/project-cover-chooser";
import { projectCoverImagesFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectCoverChooser",
  component: ProjectCoverChooser,
  args: { projectId: "pr-bathroom", coverFileId: null, canManage: true, initialImages: projectCoverImagesFixture },
  decorators: [(Story) => <div className="max-w-xs">{Story()}</div>],
} satisfies Meta<typeof ProjectCoverChooser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Attached images to choose from (in Storybook the image itself doesn't load). */
export const WithImages: Story = {};
export const CoverChosen: Story = { args: { coverFileId: "f-inspiration" } };
export const NoImages: Story = { args: { initialImages: [] } };
