import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShareLinkPanel } from "@/features/auth/components/share-link-panel";
import { LINK_TOKEN } from "../fixtures";

const meta = {
  title: "Features/Auth/Components/ShareLinkPanel",
  component: ShareLinkPanel,
  decorators: [(Story) => <div className="w-[min(24rem,100vw-2rem)]"><Story /></div>],
  args: {
    url: `https://home.example.be/invite/${LINK_TOKEN}`,
    kind: "invite",
    personName: "Clara",
    householdName: "Wicked Home",
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  },
} satisfies Meta<typeof ShareLinkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The QR code loads lazily (a skeleton for a moment the first time). "Share…" only shows where the browser supports it. */
export const Invite: Story = {};
export const PasswordReset: Story = {
  args: { url: `https://home.example.be/reset/${LINK_TOKEN}`, kind: "password_reset", expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
};
/** On the LAN address the link starts with http://192.168.1.10:3101. */
export const LanAddress: Story = { args: { url: `http://192.168.1.10:3101/invite/${LINK_TOKEN}` } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
