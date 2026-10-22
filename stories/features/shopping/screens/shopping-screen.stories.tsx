import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShoppingScreen } from "@/features/shopping/screens/shopping-screen";
import { emptyShoppingPageFixture, fakeLinkPreview, productSelectionsFixture, shopSelectionsFixture, shoppingPageFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Screens/ShoppingScreen",
  component: ShoppingScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: shoppingPageFixture,
    canManage: true,
    previewLink: fakeLinkPreview,
    refreshIntervalMs: null,
    initialSelections: { products: productSelectionsFixture, shops: shopSelectionsFixture },
  },
} satisfies Meta<typeof ShoppingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllLists: Story = {};
export const OneList: Story = { parameters: { router: { initialEntries: ["/shopping?list=l-weekly"] } } };
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { data: emptyShoppingPageFixture } };
/** From the dashboard's quick action (`?new=1`): the cursor is in "Add an item"; the param is removed. */
export const AddFromDashboard: Story = { parameters: { router: { initialEntries: ["/shopping?new=1"] } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
