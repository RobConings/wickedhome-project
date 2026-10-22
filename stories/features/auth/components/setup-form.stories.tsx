import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { SetupForm } from "@/features/auth/components/setup-form";

const meta = {
  title: "Features/Auth/Components/SetupForm",
  component: SetupForm,
  decorators: [(Story) => <div className="w-96"><Story /></div>],
  args: { locale: "en" },
} satisfies Meta<typeof SetupForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const PasswordTooShort: Story = {
  args: { result: { errors: { password: ["Too small: expected string to have >=10 characters"] } } },
};

/** Creating the household: fields disabled and a busy button until the dashboard has loaded. */
export const Submitting: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Create household" }));
  },
};
