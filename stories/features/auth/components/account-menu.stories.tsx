import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { sessionUserFixture } from "../fixtures";
import { AccountMenu } from "@/features/auth/components/account-menu";

const meta = {
  title: "Features/Auth/Components/AccountMenu",
  component: AccountMenu,
  decorators: [(Story) => <div className="w-60"><Story /></div>],
  args: { user: sessionUserFixture },
} satisfies Meta<typeof AccountMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full width in the desktop sidebar; only the avatar shows below the `lg` breakpoint. */
export const Default: Story = {};

/** Logging out: the menu stays open with a spinner until the login page takes over. */
export const LoggingOut: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Log out" }));
  },
};
