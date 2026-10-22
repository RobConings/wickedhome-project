import { HabitantToggleChips, type HabitantToggleChipsProps } from "@/features/household";

/**
 * Who does it, as avatar chips: a household has a handful of habitants, so all are shown at once. The
 * order of picking is kept, because it is the rotation order (with numbers once several are picked).
 */
export function AssigneePicker(props: Omit<HabitantToggleChipsProps, "numbered">) {
  return <HabitantToggleChips {...props} numbered />;
}
