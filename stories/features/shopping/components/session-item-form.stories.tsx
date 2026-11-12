import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionItemForm } from "@/features/shopping/components/session-item-form";
import { shoppingPageFixture } from "../fixtures";
import { sessionFixture } from "../session-fixtures";
const meta = { title: "Features/Shopping/Components/SessionItemForm", component: SessionItemForm,
  args: { item: sessionFixture.items[0]!, session: sessionFixture, shopping: shoppingPageFixture, disabled: false, onChange: async () => {} },
} satisfies Meta<typeof SessionItemForm>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Busy: Story = { args: { disabled: true } };
