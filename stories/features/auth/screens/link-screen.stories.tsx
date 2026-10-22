import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkScreen } from "@/features/auth/screens/link-screen";
import { linkData, sessionUserFixture, validInvitePreview, validResetPreview } from "../fixtures";

const meta = {
  title: "Features/Auth/Screens/LinkScreen",
  component: LinkScreen,
  parameters: { layout: "fullscreen" },
  args: { data: linkData(validInvitePreview) },
} satisfies Meta<typeof LinkScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Clara opens her invite: household, her name and role; email, password and language. */
export const ValidInvite: Story = {};
export const ValidReset: Story = { args: { data: linkData(validResetPreview) } };
export const Expired: Story = { args: { data: linkData({ status: "expired", kind: "invite", inviterName: "Rob" }) } };
export const Used: Story = { args: { data: linkData({ status: "used", kind: "invite", inviterName: "Rob" }) } };
export const Revoked: Story = { args: { data: linkData({ status: "revoked", kind: "invite", inviterName: "Rob" }) } };
export const ResetExpired: Story = { args: { data: linkData({ status: "expired", kind: "password_reset", inviterName: null }) } };
/** Unknown or mistyped token. */
export const Invalid: Story = { args: { data: linkData(null) } };
export const RateLimited: Story = { args: { data: linkData(null, { problem: "rateLimited" }) } };
export const Unreachable: Story = { args: { data: linkData(null, { problem: "unavailable" }) } };
/** Someone is logged in on this device: log out first. */
export const AlreadyLoggedIn: Story = { args: { data: linkData(validInvitePreview, { currentUser: sessionUserFixture }) } };
export const Submitting: Story = { args: { forceBusy: true } };
export const Error: Story = { args: { result: { formError: "This link was already used." } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
