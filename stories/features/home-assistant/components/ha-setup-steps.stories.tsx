import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaSetupSteps } from "@/features/home-assistant/components/ha-setup-steps";

const meta = {
  title: "Features/HomeAssistant/Components/HaSetupSteps",
  component: HaSetupSteps,
  args: { className: "max-w-xl" },
} satisfies Meta<typeof HaSetupSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Install, integrations (Verisure, P1, inverter), energy dashboard, token, .env, restart. */
export const Default: Story = {};
