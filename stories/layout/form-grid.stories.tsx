import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormGrid, FormGridItem } from "@/components/layout/form-grid";

function Box({ label }: { label: string }) {
  return (
    <div className="grid h-14 place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground">
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/FormGrid",
  component: FormGrid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof FormGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One column on phones; from `sm` up, half-width items sit side by side. */
export const FullAndHalf: Story = {
  render: (args) => (
    <FormGrid {...args} className="max-w-xl">
      <FormGridItem span="half">
        <Box label="Half" />
      </FormGridItem>
      <FormGridItem span="half">
        <Box label="Half" />
      </FormGridItem>
      <FormGridItem>
        <Box label="Full" />
      </FormGridItem>
      <FormGridItem span="half">
        <Box label="Half" />
      </FormGridItem>
    </FormGrid>
  ),
};
