import type { Meta, StoryObj } from "@storybook/react-vite";
import { RetailerBrowserImport } from "@/features/shopping/components/retailer-browser-import";
import { Button } from "@/components/ui/button";
const meta = { title: "Features/Shopping/Components/RetailerBrowserImport", component: RetailerBrowserImport,
  args: { id: "browser-data", disabled: false, steps: ["Sign in using your normal browser.", "Copy the filtered network archive."], privacy: "Only the retailer credentials are imported.", onImport: () => {}, actions: <Button type="button">Connect</Button> },
} satisfies Meta<typeof RetailerBrowserImport>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Ready: Story = { args: { readyLabel: "Ready to connect." } };
export const Busy: Story = { args: { disabled: true } };
