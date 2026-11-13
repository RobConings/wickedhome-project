import { disconnectedCollectAndGo, reservedCollectAndGo } from "../collect-and-go-fixtures";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopViewScreen } from "@/features/shopping/screens/shop-view-screen";
import { emptyShoppingPageFixture, fakeLinkPreview, productSelectionsFixture, shopSelectionsFixture, shoppingPageFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Screens/ShopViewScreen",
  component: ShopViewScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: shoppingPageFixture,
    collectAndGoInitial: disconnectedCollectAndGo,
    shopKey: "s-colruyt",
    canManage: true,
    previewLink: fakeLinkPreview,
    refreshIntervalMs: null,
    initialSelections: { products: productSelectionsFixture, shops: shopSelectionsFixture },
  },
} satisfies Meta<typeof ShopViewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Saturday groceries at Colruyt: staples, low stock and one-offs, grouped by aisle. */
export const Colruyt: Story = {};
/** Gamma: materials for "Insulate the jacuzzi" and screws running low in the garage. */
export const Gamma: Story = { args: { shopKey: "s-gamma" } };
export const NoShopChosen: Story = { args: { shopKey: "none" } };
export const ChooseShop: Story = { args: { shopKey: null } };
export const CombinedTrip: Story = {
  args: { shopKey: null },
  parameters: { router: { initialEntries: ["/shopping/shops?shop=s-colruyt&shop=s-gamma"] } },
};
export const SavedShopGroup: Story = {
  args: { shopKey: null, data: { ...shoppingPageFixture, shopGroups: [{ id: "weekend", name: "Weekendronde", shopIds: ["s-colruyt", "s-gamma"] }] } },
  parameters: { router: { initialEntries: ["/shopping/shops?group=weekend"] } },
};
export const NothingToBuy: Story = { args: { data: emptyShoppingPageFixture, shopKey: null } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };

export const WithReservation: Story = { args: { collectAndGoInitial: reservedCollectAndGo } };
export const WithVisitAssignments: Story = { args: { data: { ...shoppingPageFixture, sessionCoverage: { observedAt: new Date().toISOString(), truncated: false, sessions: [{ id: "gamma-trip", name: "Winkelronde", status: "active", startedAt: "2026-11-13T08:00:00Z", items: [{ productId: "pr-milk", requirementIds: ["i-milk"], quantity: 2, purchasedQuantity: 0, unit: "l" }] }] } } } };
