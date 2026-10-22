import type { Meta, StoryObj } from "@storybook/react-vite";
import { JobRunStatusBadge } from "@/features/automations";
import { JOB_RUN_STATUSES } from "@/features/automations/types/automations";

const meta = {
  title: "Features/Automations/Components/JobRunStatusBadge",
  component: JobRunStatusBadge,
  args: { status: "succeeded" },
} satisfies Meta<typeof JobRunStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {JOB_RUN_STATUSES.map((status) => (
        <JobRunStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
