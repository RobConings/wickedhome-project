import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeControlNavigation } from "@/features/home-actions/components/home-control-navigation";
const meta = { title: "Features/HomeActions/Components/HomeControlNavigation", component: HomeControlNavigation } satisfies Meta<typeof HomeControlNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = { parameters: { router: { initialEntries: ["/house?section=overview"] } } };
export const Map: Story = { parameters: { router: { initialEntries: ["/house?section=map"] } } };
