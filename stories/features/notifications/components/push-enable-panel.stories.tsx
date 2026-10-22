import type { Meta, StoryObj } from "@storybook/react-vite";
import { PushEnablePanel } from "@/features/notifications";

const meta = {
  title: "Features/Notifications/Components/PushEnablePanel",
  component: PushEnablePanel,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { support: "available", enabled: false, enabling: false, testing: false, onEnable: () => undefined, onTest: () => undefined },
} satisfies Meta<typeof PushEnablePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotEnabled: Story = {};

export const Enabling: Story = { args: { enabling: true } };

export const Enabled: Story = { args: { enabled: true } };

/** The person closed the browser's question without choosing. */
export const Dismissed: Story = { args: { dismissed: true } };

/** iPhone/iPad in Safari: the home screen steps. */
export const IPhoneHint: Story = { args: { support: "ios-install" } };

export const Blocked: Story = { args: { support: "denied" } };

export const Insecure: Story = { args: { support: "insecure" } };

export const Unsupported: Story = { args: { support: "unsupported" } };

export const Testing: Story = { args: { enabled: true, testing: true } };

export const Mobile: Story = { args: { support: "ios-install" }, globals: { viewport: { value: "mobile1", isRotated: false } } };
