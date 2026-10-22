import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ContactPicker } from "@/features/contacts/components/contact-picker";
import { contactListFixture, contactSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ContactPicker",
  component: ContactPicker,
  args: { contacts: contactListFixture, name: "contactId", onChange: fn(), initialSelections: contactSelectionsFixture },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContactPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Favourites and recently used first; search also finds the company, the trade in English and email addresses. */
export const WithFavoritesAndRecents: Story = {};
export const Selected: Story = { args: { defaultValue: "c-peeters", clearable: true } };
export const NoHistory: Story = { args: { initialSelections: { favoriteIds: [], recentIds: [] } } };
export const Loading: Story = { args: { contacts: [], loading: true } };
