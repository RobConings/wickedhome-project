import type { Meta, StoryObj } from "@storybook/react-vite";
import { CollectAndGoSettings } from "@/features/shopping/components/collect-and-go-settings";
const meta = { title: "Features/Shopping/Components/CollectAndGoSettings", component: CollectAndGoSettings, parameters: { layout: "fullscreen" }, decorators: [(Story) => <div className="mx-auto max-w-xl p-3"><Story /></div>], args: { initial: { enabled: true, connected: false, importedAt: null } } } satisfies Meta<typeof CollectAndGoSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Imported: Story = { args: { initial: { enabled: true, connected: true, importedAt: "2026-11-12T12:00:00Z" } } };
