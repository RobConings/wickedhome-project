import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectPurchasesNote } from "@/features/projects/components/project-purchases-note";
import { projectDetailFixture } from "../fixtures";

const meta = {
  title: "Features/Projects/Components/ProjectPurchasesNote",
  component: ProjectPurchasesNote,
  args: {
    projectId: projectDetailFixture.project.id,
    projectName: projectDetailFixture.project.name,
    materials: projectDetailFixture.materials,
    renderLogExpense: ({ trigger }) => trigger,
  },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ProjectPurchasesNote>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bought materials that aren't an expense yet: "Log as expense" pre-fills their total. */
export const Unlogged: Story = {};
/** Everything bought is logged: nothing shows. */
export const AllLogged: Story = {
  args: { materials: projectDetailFixture.materials.map((material) => ({ ...material, expenseId: material.bought ? "x-1" : null })) },
};
