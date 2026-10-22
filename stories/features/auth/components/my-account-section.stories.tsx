import type { Meta, StoryObj } from "@storybook/react-vite";
import { MyAccountSection } from "@/features/auth/components/my-account-section";
import { ApiRequestError } from "@/lib/api-client";
import { fakeMyAccountClient, myAccountFixture, sessionUserFixture } from "../fixtures";

const meta = {
  title: "Features/Auth/Components/MyAccountSection",
  component: MyAccountSection,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="mx-auto max-w-3xl"><Story /></div>],
  args: {
    data: myAccountFixture,
    user: sessionUserFixture,
    client: fakeMyAccountClient,
    onLocaleChange: () => new Promise((resolve) => setTimeout(resolve, 500)),
  },
} satisfies Meta<typeof MyAccountSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Email, password, language and three devices; "Sign out other devices" leaves only this one. */
export const Default: Story = {};
/** The forms work at once; only the devices wait for their data. */
export const Loading: Story = { args: { data: new Promise(() => {}) } };
export const DevicesFailed: Story = { args: { data: null } };
/** Only this device: nothing to sign out. */
export const OneDevice: Story = { args: { data: { ...myAccountFixture, sessions: myAccountFixture.sessions.slice(0, 1) } } };
/** Every save answers "wrong current password". */
export const WrongPassword: Story = {
  args: {
    client: {
      ...fakeMyAccountClient,
      changeEmail: () => Promise.reject(new ApiRequestError(400, "wrong_password", "Current password is wrong")),
      changePassword: () => Promise.reject(new ApiRequestError(400, "wrong_password", "Current password is wrong")),
    },
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
