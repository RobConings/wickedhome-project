import { HabitantToggleChips, type HabitantToggleChipsProps } from "@/features/household";

/**
 * Toggle who takes part, as avatar chips. A household has a handful of habitants, so all are shown at
 * once instead of in a search picker. The order of picking is kept: the first one colours the event.
 */
export function ParticipantPicker(props: Omit<HabitantToggleChipsProps, "numbered" | "id">) {
  return <HabitantToggleChips {...props} />;
}
