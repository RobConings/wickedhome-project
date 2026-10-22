import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChecklistEditor } from "@/features/tasks/components/checklist-editor";
import { taskFixtures } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/ChecklistEditor",
  component: ChecklistEditor,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { name: "checklist" },
} satisfies Meta<typeof ChecklistEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithSteps: Story = { args: { defaultValue: taskFixtures.jacuzzi.checklist } };
