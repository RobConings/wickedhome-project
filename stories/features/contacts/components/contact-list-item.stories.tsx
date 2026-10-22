import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ContactListItem } from "@/features/contacts/components/contact-list-item";
import { contactFixtures } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ContactListItem",
  component: ContactListItem,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: { contact: contactFixtures.peeters, isFavorite: true, onToggleFavorite: fn(), onEdit: fn() },
} satisfies Meta<typeof ContactListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithProject: Story = {};
export const NotFavorite: Story = { args: { contact: contactFixtures.spark, isFavorite: false } };
/** Children see the name as text (no edit form). */
export const ReadOnly: Story = { args: { onEdit: undefined } };
/** A long name and address wrap instead of running out of the row. */
export const LongTexts: Story = { args: { contact: contactFixtures.noTrade, isFavorite: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
