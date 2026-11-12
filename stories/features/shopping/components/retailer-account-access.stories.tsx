import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RetailerAccountAccess } from "@/features/shopping/components/retailer-account-access";
import { Button } from "@/components/ui/button";
const members = [{ id: "rob", name: "Rob", role: "owner" }, { id: "partner", name: "Partner", role: "adult" }, { id: "child", name: "Child", role: "child" }];
const meta = { title: "Features/Shopping/Components/RetailerAccountAccess", component: RetailerAccountAccess,
  args: { members, userIds: ["rob", "partner"], onChange: () => {}, actions: <Button type="button" variant="outline">Save access</Button> },
  render: (args) => { const [ids, setIds] = React.useState(args.userIds); return <RetailerAccountAccess {...args} userIds={ids} onChange={setIds} />; },
} satisfies Meta<typeof RetailerAccountAccess>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
