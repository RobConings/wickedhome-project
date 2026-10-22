import type { Meta, StoryObj } from "@storybook/react-vite";
import { WasteCollectionChip, WasteFractionIcon } from "@/features/waste/components/waste-fraction-icon";
import { WASTE_FRACTIONS, WASTE_FRACTION_COLORS } from "@/features/waste/types/waste";

const meta = {
  title: "Features/Waste/Components/WasteFractionIcon",
  component: WasteFractionIcon,
  args: { fraction: "pmd", className: "size-6" },
} satisfies Meta<typeof WasteFractionIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Every fraction as a chip, in its default colour. */
export const Chips: Story = {
  render: () => (
    <div className="flex max-w-md flex-wrap gap-2">
      {WASTE_FRACTIONS.map((fraction) => (
        <WasteCollectionChip key={fraction} collection={{ fraction, label: fraction, color: WASTE_FRACTION_COLORS[fraction], note: null }} />
      ))}
    </div>
  ),
};
/** A provider colour (Recycle! sends its own) and a note from the provider. */
export const ProviderColourAndNote: Story = {
  render: () => (
    <div className="flex gap-2">
      <WasteCollectionChip collection={{ fraction: "pmd", label: "PMD", color: "#66c3fa", note: null }} />
      <WasteCollectionChip collection={{ fraction: "paper", label: "Papier-karton", color: "#fec91b", note: "Verplaatst door feestdag" }} />
    </div>
  ),
};
