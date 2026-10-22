import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { LoginScreen } from "@/features/auth/screens/login-screen";

const meta = {
  title: "Features/Auth/Screens/LoginScreen",
  component: LoginScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WrongPassword: Story = { args: { result: { formError: "That email and password don't match." } } };

/** After pressing "Log in": the form is busy until the next page has loaded. */
export const LoggingIn: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Log in" }));
  },
};
