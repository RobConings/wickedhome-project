import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionExtraDialog } from "@/features/shopping/components/session-extra-dialog";
import { productListFixture } from "../fixtures";
const meta = { title: "Features/Shopping/Components/SessionExtraDialog", component: SessionExtraDialog, args: { products: productListFixture } } satisfies Meta<typeof SessionExtraDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

