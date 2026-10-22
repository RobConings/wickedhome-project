import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsSection } from "@/features/auth/components/accounts-section";
import {
  accountsOverviewFixture,
  adultUserFixture,
  fakeAccountsClient,
  ownerOnlyOverviewFixture,
  sessionUserFixture,
} from "../fixtures";

const meta = {
  title: "Features/Auth/Components/AccountsSection",
  component: AccountsSection,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="mx-auto max-w-3xl"><Story /></div>],
  args: { data: accountsOverviewFixture, actor: sessionUserFixture, client: fakeAccountsClient },
} satisfies Meta<typeof AccountsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Owner view: active owner (you), an adult with an open reset link, a disabled child and a pending invite. */
export const Default: Story = {};
/** Adults can't touch owners: no menu on the owner row, and no "Owner" role to hand out. */
export const AsAdult: Story = { args: { actor: adultUserFixture } };
/** Right after setup: only you, the last owner. */
export const OnlyOwner: Story = { args: { data: ownerOnlyOverviewFixture } };
export const Loading: Story = { args: { data: new Promise(() => {}) } };
/** Deferred data arriving after a moment. */
export const Deferred: Story = { args: { data: new Promise((resolve) => setTimeout(() => resolve(accountsOverviewFixture), 1200)) } };
export const Error: Story = { args: { data: null } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
