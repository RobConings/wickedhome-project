import type { Meta, StoryObj } from "@storybook/react-vite";
import { EntityMultiPicker } from "@/components/shared/entity-multi-picker";

const meta = { title: "Shared/EntityMultiPicker", component: EntityMultiPicker, args: { items: [{ id: "one", label: "Colruyt" }, { id: "two", label: "Collect&Go" }, { id: "three", label: "Bio-Planet" }], value: ["one", "two"], onChange: () => undefined } } satisfies Meta<typeof EntityMultiPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Empty: Story = { args: { value: [] } };
export const UnavailableSelection: Story = { args: { value: ["deleted"] } };
