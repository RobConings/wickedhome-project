import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionStartCard } from "@/features/shopping/components/session-start-card";
import { shoppingPageFixture } from "../fixtures";
const meta = { title: "Features/Shopping/Components/SessionStartCard", component: SessionStartCard, args: { shopping: shoppingPageFixture, destination: null, onDestinationChange: () => undefined, initialSelections: { shops: { favoriteIds: [], recentIds: [] }, groups: { favoriteIds: [], recentIds: [] } } } } satisfies Meta<typeof SessionStartCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

