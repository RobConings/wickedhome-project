import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskMaterialsPanel } from "@/features/shopping/components/task-materials-panel";
import { JACUZZI_TASK_ID, failApi, fakeLinkPreview, productListFixture, shopListFixture, stallApi, taskMaterialsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/TaskMaterialsPanel",
  component: TaskMaterialsPanel,
  args: { taskId: JACUZZI_TASK_ID, canManage: true, initial: taskMaterialsFixture, previewLink: fakeLinkPreview },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-xl border bg-card p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskMaterialsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Insulate the jacuzzi": a nail gun from Gamma (with webshop link) and plastic sheeting already bought. */
export const InsulateTheJacuzzi: Story = {};
export const ReadOnly: Story = { args: { canManage: false } };
export const NoMaterialsYet: Story = { args: { initial: { items: [], products: productListFixture, shops: shopListFixture } } };

/** First load: placeholder rows, and the pickers show placeholders until products and shops are in. */
export const Loading: Story = { args: { initial: undefined }, beforeEach: stallApi };
/** The first load failed: an error with "Try again" instead of an endless skeleton. */
export const LoadFailed: Story = { args: { initial: undefined }, beforeEach: failApi };
