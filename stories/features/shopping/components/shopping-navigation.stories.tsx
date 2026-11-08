import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShoppingNavigation } from "@/features/shopping/components/shopping-navigation";
const meta = {
  title: "Features/Shopping/Components/ShoppingNavigation",
  component: ShoppingNavigation,
  parameters: { layout: "padded", router: { initialEntries: ["/shopping"] } },
} satisfies Meta<typeof ShoppingNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Session: Story = { parameters: { router: { initialEntries: ["/shopping/sessions/example"] } } };
