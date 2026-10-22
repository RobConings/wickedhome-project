import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { LoginForm } from "@/features/auth/components/login-form";

const meta = {
  title: "Features/Auth/Components/LoginForm",
  component: LoginForm,
  decorators: [(Story) => <div className="w-80"><Story /></div>],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WrongPassword: Story = { args: { result: { formError: "That email and password don't match." } } };
export const FieldErrors: Story = { args: { result: { errors: { email: ["Invalid email address"] } } } };

/** Logging in: fields disabled and a busy button until the next page has loaded. */
export const Submitting: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Email"), "rob@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse battery");
    await userEvent.click(canvas.getByRole("button", { name: "Log in" }));
  },
};
