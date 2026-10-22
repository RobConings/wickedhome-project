import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContactProjectChips } from "@/features/contacts/components/contact-project-chips";
import { contactFixtures } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ContactProjectChips",
  component: ContactProjectChips,
  parameters: { layout: "padded" },
  args: { projects: [...contactFixtures.peeters.projects, ...contactFixtures.green.projects] },
} satisfies Meta<typeof ContactProjectChips>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A running project and a finished one (dimmed). */
export const RunningAndFinished: Story = {};
export const Running: Story = { args: { projects: contactFixtures.peeters.projects } };
