import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeActionHistory } from "@/features/home-actions/components/home-action-history";
import { overviewFixture } from "../fixtures";
const meta = { title: "Features/HomeActions/Components/HomeActionHistory", component: HomeActionHistory, args: { runs: overviewFixture.runs, canManage: true, onChanged: () => {} } } satisfies Meta<typeof HomeActionHistory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Partial: Story = {};
export const Empty: Story = { args: { runs: [] } };
