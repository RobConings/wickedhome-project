import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ShopsScreen } from "@/features/shops/screens/shops-screen";
import { shopListFixture, shopSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shops/Screens/ShopsScreen",
  component: ShopsScreen,
  parameters: { layout: "fullscreen" },
  args: { shops: shopListFixture, canAdd: true, initialSelections: shopSelectionsFixture },
} satisfies Meta<typeof ShopsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoFavorites: Story = { args: { initialSelections: { favoriteIds: [], recentIds: [] } } };
export const AsChild: Story = { args: { canAdd: false } };
export const Empty: Story = { args: { shops: [] } };
/** Accent-insensitive search on the name. */
export const Search: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "col");
  },
};
export const SearchWithoutResults: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "zzz");
  },
};
