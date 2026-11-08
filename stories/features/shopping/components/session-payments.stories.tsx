import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionPayments } from "@/features/shopping/components/session-payments";
import { sessionFixture, paymentOptionsFixture } from "../session-fixtures";
const meta = { title: "Features/Shopping/Components/SessionPayments", component: SessionPayments,
  args: { session: sessionFixture, purchase: sessionFixture.purchases[0]!, payeeDefault: "Colruyt", disabled: false, initialOptions: paymentOptionsFixture },
} satisfies Meta<typeof SessionPayments>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
