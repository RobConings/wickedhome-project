import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ContactTile } from "@/features/contacts/components/contact-tile";
import { contactFixtures } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ContactTile",
  component: ContactTile,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
  args: { contact: contactFixtures.peeters, isFavorite: true, onToggleFavorite: fn(), onEdit: fn() },
} satisfies Meta<typeof ContactTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every number and address, the website, the address and the project. */
export const Full: Story = {};
export const Minimal: Story = { args: { contact: contactFixtures.bank, isFavorite: false } };
export const FinishedProject: Story = { args: { contact: contactFixtures.green, isFavorite: false } };
export const LongTexts: Story = { args: { contact: contactFixtures.noTrade, isFavorite: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
