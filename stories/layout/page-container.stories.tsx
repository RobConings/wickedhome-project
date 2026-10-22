import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";

function Box({ label, className = "h-24" }: { label: string; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-primary/40 bg-accent/40 text-sm text-accent-foreground ${className}`}>
      {label}
    </div>
  );
}

const meta = {
  title: "Layout/PageContainer",
  component: PageContainer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Max width, gutters and the vertical gap between page blocks. */
export const WithSections: Story = {
  render: () => (
    <PageContainer>
      <Box label="Page header" className="h-16" />
      <PageSection>
        <Box label="Section A" />
        <Box label="Section A, second block" />
      </PageSection>
      <PageSection>
        <Box label="Section B" />
      </PageSection>
    </PageContainer>
  ),
};
