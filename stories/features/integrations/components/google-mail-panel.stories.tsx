import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GoogleMailPanel } from "@/features/integrations/components/google-mail-panel";
import { connectedGoogleFixture, fakeGoogleClient } from "../fixtures";

const meta = {
  title: "Features/Integrations/Components/GoogleMailPanel",
  component: GoogleMailPanel,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { settings: connectedGoogleFixture.gmail!, client: fakeGoogleClient(connectedGoogleFixture), onStatus: fn() },
} satisfies Meta<typeof GoogleMailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two suggestions waiting on the Expenses page; "Search mail now" and the sender rules. */
export const Default: Story = {};
export const NeverScanned: Story = { args: { settings: { lastScanAt: null, lastError: null, pendingCount: 0 } } };
export const LastScanFailed: Story = {
  args: { settings: { ...connectedGoogleFixture.gmail!, lastError: "gmail.googleapis.com/gmail/v1/users/me/messages timed out" } },
};
