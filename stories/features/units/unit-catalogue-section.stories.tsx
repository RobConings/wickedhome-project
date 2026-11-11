import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnitCatalogueSection } from "@/features/units";

const meta = { title: "Features/Units/UnitCatalogueSection", component: UnitCatalogueSection, args: { canManage: true, initialData: { units: [], updatedAt: null } }, decorators: [(Story) => <div className="w-full max-w-2xl p-4"><Story /></div>] } satisfies Meta<typeof UnitCatalogueSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Requests: Story = { args: { initialData: undefined } };
export const Configured: Story = { args: { initialData: { units: [{ name: "fles 75 cl", referenceUnit: "cl", factor: 75, rounding: 1, aliases: ["wijnfles"] }, { name: "doos van 6", referenceUnit: "stuk", factor: 6, rounding: 1, aliases: [] }], updatedAt: null } } };
export const ReadOnly: Story = { ...Configured, args: { ...Configured.args, canManage: false } };
export const LinkedUnits: Story = { args: { initialData: { units: [
  { name: "fles 75 cl", referenceUnit: "cl", factor: 75, rounding: 1, aliases: ["wijnfles"] },
  { name: "krat wijn", referenceUnit: "fles 75 cl", factor: 6, rounding: 1, aliases: [] },
  { name: "ton", referenceUnit: "kg", factor: 1000, rounding: 0.001, aliases: ["tonne"] },
], updatedAt: null } } };
