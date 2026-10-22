import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectMaterialsPanel } from "@/features/shopping/components/project-materials-panel";
import { projectMaterialsFixture } from "../../projects/fixtures";
import { failApi, fakeLinkPreview, productListFixture, shopListFixture, stallApi } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProjectMaterialsPanel",
  component: ProjectMaterialsPanel,
  args: { projectId: "pr-bathroom", canManage: true, initial: projectMaterialsFixture, previewLink: fakeLinkPreview },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-xl border bg-card p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectMaterialsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bathroom renovation: adhesive bought (for the "Buy materials" task), shower glass priced, silicone without a price. */
export const Bathroom: Story = {};
export const ReadOnly: Story = { args: { canManage: false } };
export const NothingYet: Story = { args: { initial: { items: [], products: productListFixture, shops: shopListFixture } } };
export const Loading: Story = { args: { initial: undefined }, beforeEach: stallApi };
export const LoadFailed: Story = { args: { initial: undefined }, beforeEach: failApi };
