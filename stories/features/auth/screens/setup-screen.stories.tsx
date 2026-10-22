import type { Meta, StoryObj } from "@storybook/react-vite";
import { SetupScreen } from "@/features/auth/screens/setup-screen";

const meta = {
  title: "Features/Auth/Screens/SetupScreen",
  component: SetupScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SetupScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
