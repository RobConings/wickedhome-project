import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ContactsScreen } from "@/features/contacts/screens/contacts-screen";
import { contactListFixture, contactSelectionsFixture, contactShopsFixture } from "../fixtures";

const meta = {
  title: "Features/Contacts/Screens/ContactsScreen",
  component: ContactsScreen,
  parameters: { layout: "fullscreen" },
  args: { contacts: contactListFixture, shops: contactShopsFixture, canManage: true, initialSelections: contactSelectionsFixture },
} satisfies Meta<typeof ContactsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped by trade, favourites first; tap a number to call, an address to mail. */
export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
export const NoFavorites: Story = { args: { initialSelections: { favoriteIds: [], recentIds: [] } } };
/** Children look up and call, but can't add or edit. */
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { contacts: [] } };
/** "contractor" finds the contact whose trade is "aannemer". */
export const SearchByTradeInEnglish: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "contractor");
  },
};
export const SearchWithoutResults: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "zzz");
  },
};
/** The name opens the edit form. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: "Jan Peeters" })[0]!);
  },
};
