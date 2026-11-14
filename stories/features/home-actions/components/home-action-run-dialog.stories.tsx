import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeActionRunDialog } from "@/features/home-actions/components/home-action-run-dialog";
import { actionFixture } from "../fixtures";
const meta = { title: "Features/HomeActions/Components/HomeActionRunDialog", component: HomeActionRunDialog, args: { action: actionFixture, onStarted: () => {} } } satisfies Meta<typeof HomeActionRunDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Unpublished: Story = { args: { action: { ...actionFixture, publishedRevision: null } } };
