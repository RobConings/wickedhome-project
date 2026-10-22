import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkAcceptForm } from "@/features/auth/components/link-accept-form";

const meta = {
  title: "Features/Auth/Components/LinkAcceptForm",
  component: LinkAcceptForm,
  decorators: [(Story) => <div className="w-[min(24rem,100vw-2rem)]"><Story /></div>],
  args: { kind: "invite", locale: "en" },
} satisfies Meta<typeof LinkAcceptForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Invite: Story = {};
export const PasswordReset: Story = { args: { kind: "password_reset", email: "clara@example.com" } };
export const Submitting: Story = { args: { forceBusy: true } };
export const FieldErrors: Story = {
  args: {
    result: {
      errors: {
        email: ["This email already has an account."],
        password: ["Too small: expected string to have >=10 characters"],
        confirmPassword: ["The passwords don't match."],
      },
    },
  },
};
export const LinkExpiredWhileOpen: Story = { args: { result: { formError: "This link has expired." } } };
