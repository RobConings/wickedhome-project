import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectFormField, ProjectPicker } from "@/features/projects/components/project-picker";
import { projectListFixture, projectSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectPicker",
  component: ProjectPicker,
  args: { projects: projectListFixture, initialSelections: projectSelectionsFixture, clearable: true },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof ProjectPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Selected: Story = { args: { defaultValue: "pr-bathroom" } };
/** Projects still loading (it fetches them itself on a real page). */
export const Loading: Story = { args: { loading: true } };

/** As other features' forms show it, through their `projectField` slot. */
export const AsFormField: Story = {
  render: () => <ProjectFormField defaultValue="pr-christmas" projects={projectListFixture} initialSelections={projectSelectionsFixture} />,
};
