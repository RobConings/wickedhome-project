import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopGroupFormDialog } from "@/features/shops/components/shop-group-form-dialog";
import { Button } from "@/components/ui/button";
import { shopListFixture } from "../fixtures";
const meta = { title: "Features/Shops/Components/ShopGroupFormDialog", component: ShopGroupFormDialog, args: { shops: shopListFixture, trigger: <Button>Create a group</Button> } } satisfies Meta<typeof ShopGroupFormDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

