import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShoppingAssignmentBadges } from "@/features/shopping/components/shopping-assignment-badges";
const meta = { title: "Features/Shopping/Components/ShoppingAssignmentBadges", component: ShoppingAssignmentBadges, args: { assignments: [{ kind: "reservation", id: "2201", href: "/shopping/sessions?retailer=collectandgo&order=2201", name: "Collect&Go", pickupFrom: "2030-11-16T07:30:00Z" }, { kind: "session", id: "trip", href: "/shopping/sessions/trip", name: "Wekelijkse winkelronde" }] } } satisfies Meta<typeof ShoppingAssignmentBadges>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Combined: Story = {};
export const Basket: Story = { args: { assignments: [{ kind: "basket", id: "basket", href: "/shopping?retailer=collectandgo", name: "Collect&Go" }] } };
