import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopDestinationPicker } from "@/features/shops/components/shop-destination-picker";
import { shopListFixture } from "../fixtures";
const meta = { title: "Features/Shops/Components/ShopDestinationPicker", component: ShopDestinationPicker, parameters: { layout: "padded" }, args: { shops: shopListFixture, groups: [{ id: "weekly", name: "Weekly groceries", shopIds: shopListFixture.slice(0, 2).map((shop) => shop.id) }], value: null, onChange: () => undefined, initialSelections: { shops: { favoriteIds: [], recentIds: [] }, groups: { favoriteIds: [], recentIds: [] } } } } satisfies Meta<typeof ShopDestinationPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

