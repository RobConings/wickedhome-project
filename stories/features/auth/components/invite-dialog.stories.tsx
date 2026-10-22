import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteDialog } from "@/features/auth/components/invite-dialog";
import { LINK_TOKEN, accountsOverviewFixture, createdInviteFixture, fakeAccountsClient } from "../fixtures";

const meta = {
  title: "Features/Auth/Components/InviteDialog",
  component: InviteDialog,
  args: {
    open: true,
    onOpenChange: () => {},
    actorRole: "owner",
    householdName: "Wicked Home",
    habitants: accountsOverviewFixture.invitableHabitants,
    client: fakeAccountsClient,
    onCreated: () => {},
  },
} satisfies Meta<typeof InviteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pick an existing habitant without an account; "Make link" shows the QR code after a moment. */
export const Default: Story = {};
/** Nobody left without an account: add a new person inline (name, type, colour). */
export const NewPerson: Story = { args: { habitants: [] } };
/** Adults can hand out Adult and Child only. */
export const AsAdult: Story = { args: { actorRole: "adult" } };
/** "Make new link" for a pending invite: person and role are fixed. */
export const NewLinkForPending: Story = {
  args: { preset: { person: accountsOverviewFixture.pendingInvites[0]!.person, role: "child" } },
};
/** The link step: QR code, copy, and Share on phones. */
export const LinkReady: Story = {
  args: { initialCreated: { created: createdInviteFixture, url: `https://home.example.be/invite/${LINK_TOKEN}` } },
};
export const Submitting: Story = { args: { client: { invite: () => new Promise(() => {}) } } };
export const Mobile: Story = { ...LinkReady, globals: { viewport: { value: "mobile1" } } };
