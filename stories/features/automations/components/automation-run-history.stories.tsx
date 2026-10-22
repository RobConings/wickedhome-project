import type { Meta, StoryObj } from "@storybook/react-vite";
import { AutomationRunHistory } from "@/features/automations/components/automation-run-history";
import { failedAutomationsFixture, runningAutomationsFixture, wasteSyncJob } from "../fixtures";

const runsOf = (overview: typeof failedAutomationsFixture) =>
  overview.jobs.find((job) => job.id === wasteSyncJob.id)?.recentRuns ?? wasteSyncJob.recentRuns;

const meta = {
  title: "Features/Automations/Components/AutomationRunHistory",
  component: AutomationRunHistory,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { runs: wasteSyncJob.recentRuns, now: Date.now() },
} satisfies Meta<typeof AutomationRunHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** A failed run with its error and log, and a skipped one. */
export const WithFailure: Story = { args: { runs: runsOf(failedAutomationsFixture) } };
export const Running: Story = { args: { runs: runsOf(runningAutomationsFixture) } };
export const Empty: Story = { args: { runs: [] } };
