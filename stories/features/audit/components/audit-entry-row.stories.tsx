import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuditEntryRow, AuditEntryTile } from "@/features/audit";
import { armedEntry, assistantEntry, auditEntriesFixture, correctedEntry, failedEntry, jobEntry, mcpEntry } from "../fixtures";

const meta = {
  title: "Features/Audit/Components/AuditEntryRow",
  component: AuditEntryRow,
  decorators: [(Story) => <div className="w-[36rem] max-w-full">{Story()}</div>],
  args: { entry: armedEntry },
} satisfies Meta<typeof AuditEntryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An action the app writes itself: translated title, target after it. */
export const AlarmArmed: Story = {};

/** An assistant tool call: the confirmation text is the title. */
export const Assistant: Story = { args: { entry: assistantEntry } };

export const Mcp: Story = { args: { entry: mcpEntry } };

/** With a summary under the title. */
export const BalanceCorrected: Story = { args: { entry: correctedEntry } };

export const Automation: Story = { args: { entry: jobEntry } };

export const FailedAttempt: Story = { args: { entry: failedEntry } };

/** The same entries as tiles. */
export const Tiles: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      {auditEntriesFixture.slice(0, 4).map((entry) => (
        <AuditEntryTile key={entry.id} entry={entry} />
      ))}
    </div>
  ),
};
