import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecordOrigin } from "@/components/shared/record-origin";

const meta = { title: "Shared/RecordOrigin", component: RecordOrigin, parameters: { router: { initialEntries: ["/tasks/one?from=%2Fprojects%3Fstatus%3Dactive%23materials"] } }, args: {} } satisfies Meta<typeof RecordOrigin>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

