import { disconnectedCollectAndGo, reservedCollectAndGo } from "../collect-and-go-fixtures";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionsScreen } from "@/features/shopping/screens/sessions-screen";
import { shoppingPageFixture } from "../fixtures";
import { sessionFixture } from "../session-fixtures";
const meta = { title: "Features/Shopping/Screens/SessionsScreen", component: SessionsScreen, parameters: { layout: "fullscreen" },
  args: { collectAndGoInitial: disconnectedCollectAndGo, shopping: shoppingPageFixture, sessions: [], session: null, canManage: true, live: false, initialSelections: { shops: { favoriteIds: [], recentIds: [] }, groups: { favoriteIds: [], recentIds: [] } } },
} satisfies Meta<typeof SessionsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Start: Story = {};
export const Checklist: Story = { args: { session: { ...sessionFixture, purchases: [] } } };
export const Child: Story = { args: { canManage: false, session: { ...sessionFixture, purchases: [] } } };
const shopIds = shoppingPageFixture.shops.slice(0, 3).map((shop) => shop.id);
const activeVisit = { ...sessionFixture, name: "Colruyt-groep · 2026-11-08", startedAt: "2026-11-08T09:00:00Z", shopIds, id: "active-visit" };
const completedVisit = { ...sessionFixture, id: "completed-visit", status: "closed" as const,
  name: "Wekelijkse boodschappen · 2026-11-01", startedAt: "2026-11-01T09:00:00Z",
  closedAt: "2026-11-01T10:45:00Z", shopIds: shopIds.slice(0, 1) };
/** All cards are genuine links with identifiable shops, even if no product details are loaded. */
export const ActiveAndPreviousCards: Story = { args: {
  sessions: [activeVisit, completedVisit], session: null,
} };
export const ActiveAndPreviousCardsPhone: Story = {
  args: ActiveAndPreviousCards.args,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
/** Session detail is a compact shopping checklist; receipts stay in the second shared tab. */
export const GroupChecklist: Story = { args: { session: { ...activeVisit, purchases: [] }, sessions: [activeVisit] } };
export const GroupChecklistPhone: Story = { args: GroupChecklist.args,
  globals: { viewport: { value: "mobile1", isRotated: false } } };
export const ClosedChecklist: Story = { args: {
  session: { ...completedVisit, items: sessionFixture.items, purchases: [] },
  sessions: [completedVisit],
} };


export const WithOnlineReservation: Story = { args: { sessions: [activeVisit], collectAndGoInitial: reservedCollectAndGo } };
export const OnlineReservationDetail: Story = { args: { collectAndGoInitial: reservedCollectAndGo }, parameters: { router: { initialEntries: ["/shopping/sessions?retailer=collectandgo&order=2201"] } } };
