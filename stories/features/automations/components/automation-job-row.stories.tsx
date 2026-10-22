import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AutomationJobRow } from "@/features/automations/components/automation-job-row";
import { failedAutomationsFixture, neverRunJob, remindersJob, runningAutomationsFixture, shopIconsJob, wasteSyncJob } from "../fixtures";

const failedJob = failedAutomationsFixture.jobs.find((job) => job.id === wasteSyncJob.id) ?? wasteSyncJob;
const runningJob = runningAutomationsFixture.jobs.find((job) => job.id === wasteSyncJob.id) ?? wasteSyncJob;

const meta = {
  title: "Features/Automations/Components/AutomationJobRow",
  component: AutomationJobRow,
  decorators: [(Story) => <ul className="w-[44rem] max-w-full rounded-xl border bg-card p-5">{Story()}</ul>],
  args: { job: wasteSyncJob, canManage: true, now: Date.now(), onEnabledChange: fn(), onRun: fn() },
} satisfies Meta<typeof AutomationJobRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const HistoryOpen: Story = { args: { defaultExpanded: true } };
export const Running: Story = { args: { job: runningJob, defaultExpanded: true } };
/** "Run now" was clicked; the server hasn't answered yet. */
export const Starting: Story = { args: { starting: true } };
export const Failed: Story = { args: { job: failedJob, defaultExpanded: true } };
export const Paused: Story = { args: { job: { ...shopIconsJob, enabled: false, nextRunAt: null } } };
/** Weekly, and it hasn't run yet. */
export const NeverRun: Story = { args: { job: neverRunJob, defaultExpanded: true } };
export const ReadOnly: Story = { args: { canManage: false } };
/** Every minute: idle checks aren't recorded, so it shows the last real run and when it last checked. */
export const EveryMinute: Story = { args: { job: remindersJob } };
/** The same on a phone. */
export const EveryMinuteMobile: Story = {
  args: { job: remindersJob },
  globals: { viewport: { value: "mobile1" } },
};
