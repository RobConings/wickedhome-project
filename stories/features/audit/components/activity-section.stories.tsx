import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivitySection } from "@/features/audit";
import { auditEntriesFixture, fakeAuditClient } from "../fixtures";

const meta = {
  title: "Features/Audit/Components/ActivitySection",
  component: ActivitySection,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { client: fakeAuditClient() },
} satisfies Meta<typeof ActivitySection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** App, assistant, MCP and automation entries. Try the filters and the search ("alarm", "Clara"). */
export const Default: Story = {};

/** Pages of four: "Show older" loads the next page. */
export const Paged: Story = { args: { client: fakeAuditClient(auditEntriesFixture, { pageSize: 4 }) } };

export const Empty: Story = { args: { client: fakeAuditClient([]) } };

/** A skeleton until the first page arrives. */
export const Loading: Story = { args: { client: fakeAuditClient(auditEntriesFixture, { delayMs: Infinity }) } };

export const LoadError: Story = { args: { client: fakeAuditClient(auditEntriesFixture, { fail: true }) } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
