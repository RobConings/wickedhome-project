import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContactAvatar } from "@/features/contacts/components/contact-avatar";

const meta = {
  title: "Features/Contacts/Components/ContactAvatar",
  component: ContactAvatar,
  args: { name: "Jan Peeters", size: "md" },
} satisfies Meta<typeof ContactAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { name: "Bouwbedrijf Peeters", size: "lg" } };
export const OneWord: Story = { args: { name: "KBC" } };
