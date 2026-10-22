import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyNav } from "@/features/energy/components/energy-nav";

const meta = {
  title: "Features/Energy/Components/EnergyNav",
  component: EnergyNav,
  parameters: { router: { initialEntries: ["/energy"] } },
} satisfies Meta<typeof EnergyNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Appliances: Story = { parameters: { router: { initialEntries: ["/energy/appliances"] } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
