import type { Meta, StoryObj } from "@storybook/react-vite";
import { GoogleDrivePanel } from "@/features/integrations/components/google-drive-panel";
import { connectedGoogleFixture, fakeGoogleClient } from "../fixtures";

const meta = {
  title: "Features/Integrations/Components/GoogleDrivePanel",
  component: GoogleDrivePanel,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { settings: { linkCount: 1 }, client: fakeGoogleClient(connectedGoogleFixture) },
} satisfies Meta<typeof GoogleDrivePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One folder linked. "Link a Drive folder" opens the folder picker (browse My Drive, link the open folder). */
export const Default: Story = {};
export const NothingLinked: Story = { args: { settings: { linkCount: 0 } } };
/** The picker's folder list loads forever: skeleton. */
export const PickerLoading: Story = { args: { client: fakeGoogleClient(connectedGoogleFixture, { hang: true }) } };
