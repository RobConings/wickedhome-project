import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeActionEditor } from "@/features/home-actions/components/home-action-editor";
import { actionFixture, overviewFixture } from "../fixtures";
const meta = { title: "Features/HomeActions/Components/HomeActionEditor", component: HomeActionEditor, args: { initial: actionFixture, devices: overviewFixture.devices, canPublish: true, onSaved: () => {}, onClose: () => {} } } satisfies Meta<typeof HomeActionEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Existing: Story = {};
export const New: Story = { args: { initial: undefined } };
export const Offline: Story = { args: { canPublish: false } };
