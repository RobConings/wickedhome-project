import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageGrid } from "@/components/layout/page-grid";

function Box({ label, className = "h-24" }: { label: string; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground ${className}`}>
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/PageGrid",
  component: PageGrid,
  parameters: { layout: "padded" },
  argTypes: { columns: { control: "select", options: ["1", "2", "3", "main-sidebar", "cards", "tiles", "stats", "stats-4", "chips"] } },
} satisfies Meta<typeof PageGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MainSidebar: Story = {
  args: { columns: "main-sidebar" },
  render: (args) => (
    <PageGrid {...args}>
      <Box label="Main" className="h-48" />
      <Box label="Sidebar" className="h-48" />
    </PageGrid>
  ),
};

export const TwoColumns: Story = {
  args: { columns: "2" },
  render: (args) => (
    <PageGrid {...args}>
      <Box label="1" />
      <Box label="2" />
    </PageGrid>
  ),
};

export const Cards: Story = {
  args: { columns: "cards" },
  render: (args) => (
    <PageGrid {...args}>
      {Array.from({ length: 7 }, (_, index) => (
        <Box key={index} label={`Card ${index + 1}`} />
      ))}
    </PageGrid>
  ),
};

/** Compact tiles (GeneralList's tiles view): one per row on phones, then as many as fit. */
export const Tiles: Story = {
  args: { columns: "tiles" },
  render: (args) => (
    <PageGrid {...args}>
      {Array.from({ length: 9 }, (_, index) => (
        <Box key={index} label={`Tile ${index + 1}`} />
      ))}
    </PageGrid>
  ),
};

/** Stat tiles: one per row on phones, two from `sm`, as many as fit from `lg`. */
export const Stats: Story = {
  args: { columns: "stats" },
  render: (args) => (
    <PageGrid {...args}>
      {Array.from({ length: 3 }, (_, index) => (
        <Box key={index} label={`Stat ${index + 1}`} />
      ))}
    </PageGrid>
  ),
};

/** Exactly four stat tiles (the dashboard): one per row on phones, two from `sm`, four from `lg`. */
export const StatsFour: Story = {
  args: { columns: "stats-4" },
  render: (args) => (
    <PageGrid {...args}>
      {Array.from({ length: 4 }, (_, index) => (
        <Box key={index} label={`Stat ${index + 1}`} />
      ))}
    </PageGrid>
  ),
};

/** The one exception: tiny icon + number chips, two per row on phones. */
export const Chips: Story = {
  args: { columns: "chips" },
  render: (args) => (
    <PageGrid {...args}>
      {Array.from({ length: 6 }, (_, index) => (
        <Box key={index} label={`${index + 18}°`} className="h-16" />
      ))}
    </PageGrid>
  ),
};

/** Phones: every variant is a single column (cards and tiles stacked full width). */
export const Mobile: Story = { ...Tiles, globals: { viewport: { value: "mobile1" } } };
