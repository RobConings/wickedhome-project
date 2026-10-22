import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DevicePalette } from "@/features/devices/components/device-palette";
import { useDeviceStates } from "@/features/devices/components/device-indicator";
import type { Device } from "@/features/devices/types/devices";
import { DEVICES_NOW, deviceFixtures, profilesFixture } from "../fixtures";

function PaletteDemo({
  unplaced,
  selected,
  saving,
  failed,
  placingId: initialPlacingId = null,
}: {
  unplaced: Device[];
  selected?: Device | null;
  saving?: boolean;
  failed?: boolean;
  placingId?: string | null;
}) {
  const stateOf = useDeviceStates(profilesFixture, DEVICES_NOW);
  const [placingId, setPlacingId] = React.useState<string | null>(initialPlacingId);
  return (
    <div className="w-[40rem] max-w-full rounded-xl border border-dashed bg-muted/40 p-3">
      <DevicePalette
        unplaced={unplaced}
        profiles={profilesFixture}
        stateOf={stateOf}
        floorId="f-ground"
        saving={saving}
        failed={failed}
        selected={selected}
        onRemove={() => undefined}
        placingId={placingId}
        onPlace={(id) => setPlacingId((current) => (current === id ? null : id))}
      />
    </div>
  );
}

const unplaced: Device[] = [
  deviceFixtures.bedroomThermostat,
  { ...deviceFixtures.hallSmoke, id: "d-office-smoke", name: "Office smoke detector", position: null, floorId: null },
];

const meta = {
  title: "Features/Devices/Components/DevicePalette",
  component: PaletteDemo,
  args: { unplaced },
} satisfies Meta<typeof PaletteDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unplaced: Story = {};
/** A placed device is selected on the plan: open it or take it off the plan. */
export const WithSelection: Story = { args: { selected: deviceFixtures.dryer } };
export const AllPlaced: Story = { args: { unplaced: [] } };
/** "Place on the plan" was pressed for the thermostat: the next tap on the plan puts it there. */
export const Placing: Story = { args: { placingId: deviceFixtures.bedroomThermostat.id } };

/** A dropped device's position is being saved (shown optimistically on the plan meanwhile). */
export const SavingPosition: Story = { args: { saving: true } };
export const LoadFailed: Story = { args: { failed: true } };
