import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  LoadingState,
  PendingContent,
  SkeletonBlock,
  SkeletonList,
  SkeletonPage,
  SkeletonTiles,
} from "@/components/shared/loading-state";

const meta = {
  title: "Shared/LoadingState",
  component: LoadingState,
  args: { label: "Loading readings…" },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Spinner: Story = {};

export const List: Story = { render: () => <SkeletonList className="max-w-xl" /> };

export const Tiles: Story = { render: () => <SkeletonTiles /> };

export const Block: Story = { render: () => <SkeletonBlock /> };

export const Page: Story = { render: () => <SkeletonPage /> };

export const Refreshing: Story = {
  render: () => (
    <PendingContent pending label="Loading September…" className="max-w-xl">
      <div className="rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">Electricity this month</p>
        <p className="text-3xl font-semibold">312 kWh</p>
      </div>
    </PendingContent>
  ),
};
