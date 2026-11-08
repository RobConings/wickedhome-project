import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContactDetailScreen } from "@/features/contacts/screens/contact-detail-screen";
import { contactFixtures, contactSelectionsFixture, contactShopsFixture } from "../fixtures";
const meta = {
  title: "Features/Contacts/Screens/ContactDetailScreen", component: ContactDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { contact: contactFixtures.peeters, shops: contactShopsFixture, canManage: true, initialSelections: contactSelectionsFixture, shopSelections: { favoriteIds: [], recentIds: [] } },
} satisfies Meta<typeof ContactDetailScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Supplier: Story = { args: { contact: contactFixtures.tiles } };
export const Empty: Story = { args: { contact: contactFixtures.noTrade } };
