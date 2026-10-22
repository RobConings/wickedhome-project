import type { Meta, StoryObj } from "@storybook/react-vite";
import { DriveStorageCard } from "@/features/integrations/components/drive-storage-card";
import { driveStorageFixtures as fixtures, fakeDriveStorageClient } from "../drive-storage-fixtures";

const meta = {
  title: "Features/Integrations/Components/DriveStorageCard",
  component: DriveStorageCard,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { data: fixtures.active, client: fakeDriveStorageClient(fixtures.active), pollMs: 700 },
} satisfies Meta<typeof DriveStorageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On: bill documents go to "Facturen" in your Drive; the switches for year folders and removing from Drive. */
export const Active: Story = {};
/** Older bill documents are still on the server: "Move 23 documents to Drive" shows progress (fake counts down). */
export const ActiveWithLocalFiles: Story = {
  args: { data: fixtures.activeWithLocal, client: fakeDriveStorageClient(fixtures.activeWithLocal) },
};
/** Drive failed (quota) for some uploads: they wait on the server and are retried; the last problem is shown. */
export const FallbackPending: Story = {
  args: { data: fixtures.fallbackPending, client: fakeDriveStorageClient(fixtures.fallbackPending) },
};
/** Not set up, and you haven't turned on Drive: one button to connect it. */
export const NotConnected: Story = {
  args: { data: fixtures.notConnected, client: fakeDriveStorageClient(fixtures.notConnected) },
};
/** Not set up: create a new folder (works with Drive as it is) or use an existing one (asks for more access first). */
export const ChooseFolder: Story = {
  args: { data: fixtures.chooseFolder, client: fakeDriveStorageClient(fixtures.chooseFolder) },
};
/** Full Drive access already granted: "Existing folder" opens the folder picker. */
export const ChooseFolderWithFullAccess: Story = {
  args: { data: fixtures.chooseFolderFullDrive, client: fakeDriveStorageClient(fixtures.chooseFolderFullDrive) },
};
/** Saved in someone else's Drive (Clara's existing folder); you can switch it to yours. */
export const OtherPersonsDrive: Story = {
  args: { data: fixtures.otherPersonsDrive, client: fakeDriveStorageClient(fixtures.otherPersonsDrive) },
};
/** The Drive's owner disconnected Google: clear warning, new bills stay on the server. */
export const PausedDisconnected: Story = {
  args: { data: fixtures.pausedDisconnected, client: fakeDriveStorageClient(fixtures.pausedDisconnected) },
};
/** Google refused your consent: reconnect; meanwhile new bills wait on the server. */
export const PausedNeedsReconnect: Story = {
  args: { data: fixtures.pausedNeedsReconnect, client: fakeDriveStorageClient(fixtures.pausedNeedsReconnect) },
};
/** Google isn't set up on the server. */
export const NotConfigured: Story = {
  args: { data: fixtures.notConfigured, client: fakeDriveStorageClient(fixtures.notConfigured) },
};
/** The status is still on its way (deferred loader data): skeleton. */
export const Loading: Story = { args: { data: new Promise(() => undefined) } };
/** The status couldn't be loaded: Retry. */
export const LoadError: Story = { args: { data: null, client: fakeDriveStorageClient(fixtures.active, { fail: true }) } };
export const Mobile: Story = {
  args: { data: fixtures.fallbackPending, client: fakeDriveStorageClient(fixtures.fallbackPending) },
  globals: { viewport: { value: "mobile1" } },
};
