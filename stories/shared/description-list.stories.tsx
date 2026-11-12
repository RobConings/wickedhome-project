import type { Meta, StoryObj } from "@storybook/react-vite";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";

const meta = {
  title: "Shared/DescriptionList",
  component: DescriptionList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DescriptionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DescriptionList className="max-w-2xl">
      <DescriptionItem label="Created">2 October 2026</DescriptionItem>
      <DescriptionItem label="Owner">Rob</DescriptionItem>
      <DescriptionItem label="Reference">
        <span className="font-mono">ABC-123</span>
      </DescriptionItem>
      <DescriptionItem label="Status">Active</DescriptionItem>
      <DescriptionItem label="Notes" wide>
        Long values span both columns so they stay readable on wide screens.
      </DescriptionItem>
    </DescriptionList>
  ),
};

export const PropertyRows: Story = { render: () => <DescriptionList columns="1" className="max-w-xl gap-0 divide-y">
  <DescriptionItem layout="row" label="Storage" className="py-3">Kitchen cupboard</DescriptionItem>
  <DescriptionItem layout="row" label="Minimum stock" className="py-3">2 packs</DescriptionItem>
</DescriptionList> };
