import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LinkedDriveFolders, SaveToDriveMenuItem } from "@/features/integrations/components/drive-documents";
import { connectedGoogleFixture, driveLinksFixture, fakeGoogleClient } from "../fixtures";

const meta = {
  title: "Features/Integrations/Components/LinkedDriveFolders",
  component: LinkedDriveFolders,
  decorators: [(Story) => <div className="w-[48rem] max-w-full">{Story()}</div>],
  args: { initial: driveLinksFixture, client: fakeGoogleClient(connectedGoogleFixture) },
} satisfies Meta<typeof LinkedDriveFolders>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drive folders at the top of Documents, with a Drive badge; one is unavailable (its owner must reconnect). */
export const DriveFolders: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };

/** "Save to Drive" in a document's ⋯ menu (only for people who turned Drive on). */
export const SaveToDrive: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Menu">
          <MoreVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <SaveToDriveMenuItem file={{ id: "doc1", storageProvider: "local" }} client={fakeGoogleClient(connectedGoogleFixture)} />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
