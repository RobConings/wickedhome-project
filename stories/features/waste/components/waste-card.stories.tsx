import type { Meta, StoryObj } from "@storybook/react-vite";
import { WasteCard, WasteCardSkeleton } from "@/features/waste/components/waste-card";
import {
  WASTE_TODAY,
  failedWasteSummaryFixture,
  unconfiguredWasteSummaryFixture,
  wasteLaterSummaryFixture,
  wasteSummaryFixture,
  wasteTodaySummaryFixture,
} from "../fixtures";

const meta = {
  title: "Features/Waste/Components/WasteCard",
  component: WasteCard,
  decorators: [(Story) => <div className="w-[24rem] max-w-full">{Story()}</div>],
  args: { summary: wasteSummaryFixture, today: WASTE_TODAY },
} satisfies Meta<typeof WasteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The evening before a collection: stands out with "put it out tonight". */
export const Tomorrow: Story = {};
export const Today: Story = { args: { summary: wasteTodaySummaryFixture } };
export const NextWeek: Story = { args: { summary: wasteLaterSummaryFixture } };
/** No collector connected yet: points to Settings. */
export const NotSetUp: Story = { args: { summary: unconfiguredWasteSummaryFixture } };
export const SyncFailed: Story = { args: { summary: failedWasteSummaryFixture } };
export const FailedToLoad: Story = { args: { summary: null } };
export const Loading: Story = { render: () => <WasteCardSkeleton /> };
