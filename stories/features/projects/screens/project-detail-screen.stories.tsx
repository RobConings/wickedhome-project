import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectContactsPanel } from "@/features/contacts/components/project-contacts-panel";
import { ProjectDetailScreen } from "@/features/projects/screens/project-detail-screen";
import { ProjectMaterialsPanel } from "@/features/shopping/components/project-materials-panel";
import { ProjectTasksPanel } from "@/features/tasks/components/project-tasks-panel";
import { contactListFixture, contactSelectionsFixture } from "../../contacts/fixtures";
import { taskPlaces } from "../../tasks/fixtures";
import {
  overBudgetDetailFixture,
  projectDetailFixture,
  projectMaterialsFixture,
  projectPlacesFixture,
  projectTaskHabitants,
  projectTasksOverviewFixture,
} from "../fixtures";

const tasks = (
  <ProjectTasksPanel
    projectId="pr-bathroom"
    initialData={{ overview: projectTasksOverviewFixture, habitants: projectTaskHabitants, places: taskPlaces }}
  />
);
const materials = <ProjectMaterialsPanel projectId="pr-bathroom" canManage initial={projectMaterialsFixture} />;
const contacts = (
  <ProjectContactsPanel projectId="pr-bathroom" canManage initialData={{ contacts: contactListFixture }} initialSelections={contactSelectionsFixture} />
);

const meta = {
  title: "Features/Projects/Screens/ProjectDetailScreen",
  component: ProjectDetailScreen,
  parameters: { layout: "fullscreen" },
  args: {
    detail: projectDetailFixture,
    places: projectPlacesFixture,
    canManage: true,
    tasks,
    materials,
    contacts,
    renderLogExpense: ({ trigger }) => trigger,
  },
} satisfies Meta<typeof ProjectDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A renovation: a chain of tasks ("Buy materials" → "Remove the old tiles" → "Start tiling"), materials, expenses. */
export const WithTasksMaterialsAndExpenses: Story = {};
/** A holiday over budget, with a recurring expense (travel insurance). */
export const OverBudget: Story = {
  args: { detail: overBudgetDetailFixture, tasks: undefined, materials: undefined },
};
/** The task and material panels load their own data: skeletons first (no API in Storybook). */
export const Loading: Story = {
  args: {
    tasks: <ProjectTasksPanel projectId="pr-bathroom" />,
    materials: <ProjectMaterialsPanel projectId="pr-bathroom" canManage={false} />,
  },
};
export const AsChild: Story = { args: { canManage: false } };
