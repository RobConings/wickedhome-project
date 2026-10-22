import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectContactsPanel } from "@/features/contacts/components/project-contacts-panel";
import { contactListFixture, contactSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Contacts/Components/ProjectContactsPanel",
  component: ProjectContactsPanel,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: {
    projectId: "pr-bathroom",
    canManage: true,
    initialData: { contacts: contactListFixture },
    initialSelections: contactSelectionsFixture,
  },
} satisfies Meta<typeof ProjectContactsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The contractor and the plumber of the bathroom, with Link a contact and New contact. */
export const Linked: Story = {};
export const NoContacts: Story = { args: { projectId: "pr-other" } };
export const AsChild: Story = { args: { canManage: false } };
/** Without data and without an API (Storybook): skeletons, then the retry state. */
export const Loading: Story = { args: { initialData: undefined } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
