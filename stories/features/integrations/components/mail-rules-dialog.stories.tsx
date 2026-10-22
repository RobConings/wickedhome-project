import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { MailRulesDialog } from "@/features/integrations/components/mail-rules-dialog";
import { connectedGoogleFixture, fakeGoogleClient } from "../fixtures";

const meta = {
  title: "Features/Integrations/Components/MailRulesDialog",
  component: MailRulesDialog,
  args: { client: fakeGoogleClient(connectedGoogleFixture), trigger: <Button variant="outline">Senders…</Button> },
} satisfies Meta<typeof MailRulesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open it: built-in Belgian providers (switch off, edit) and an own rule (edit, remove), "Add sender". */
export const Default: Story = {};
/** The rules load forever: skeleton. */
export const Loading: Story = { args: { client: fakeGoogleClient(connectedGoogleFixture, { hang: true }) } };
