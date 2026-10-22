import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectsScreen } from "@/features/projects/screens/projects-screen";
import { emptyProjectsOverviewFixture, projectPlacesFixture, projectsOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Screens/ProjectsScreen",
  component: ProjectsScreen,
  parameters: { layout: "fullscreen" },
  args: { overview: projectsOverviewFixture, places: projectPlacesFixture, canManage: true },
} satisfies Meta<typeof ProjectsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Running projects as tiles: in budget, almost at budget, over budget and without a budget. */
export const Running: Story = {};
export const AllProjects: Story = { parameters: { router: { initialEntries: ["/?status=all"] } } };
export const Done: Story = { parameters: { router: { initialEntries: ["/?status=done"] } } };
export const Empty: Story = { args: { overview: emptyProjectsOverviewFixture } };
export const AsChild: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
