import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContactLinks } from "@/features/contacts/components/contact-links";
import { contactFixtures } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ContactLinks",
  component: ContactLinks,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: { contact: contactFixtures.peeters },
} satisfies Meta<typeof ContactLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The primary number and address (rows). */
export const Primary: Story = {};
/** Every number and address plus the website (tiles). */
export const All: Story = { args: { all: true, website: true } };
/** A long address wraps inside its pill. */
export const LongEmail: Story = { args: { contact: contactFixtures.noTrade } };
export const Mobile: Story = { args: { all: true, website: true }, globals: { viewport: { value: "mobile1" } } };
