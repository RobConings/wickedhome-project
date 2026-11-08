import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionsScreen } from "@/features/shopping/screens/sessions-screen";
import { shoppingPageFixture } from "../fixtures";
import { sessionFixture } from "../session-fixtures";
const meta = { title: "Features/Shopping/Screens/SessionsScreen", component: SessionsScreen, parameters: { layout: "fullscreen" },
  args: { shopping: shoppingPageFixture, sessions: [], session: null, canManage: true, live: false, initialSelections: { shops: { favoriteIds: [], recentIds: [] }, groups: { favoriteIds: [], recentIds: [] } } },
} satisfies Meta<typeof SessionsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Start: Story = {};
export const Checklist: Story = { args: { session: { ...sessionFixture, purchases: [] } } };
export const Child: Story = { args: { canManage: false, session: { ...sessionFixture, purchases: [] } } };
