import { useTranslation } from "react-i18next";
import type { Habitant } from "../types/household";
import { HabitantAvatar } from "./habitant-avatar";
import { SelectionsPicker } from "@/components/shared/selections-picker";

type HabitantPickerProps = {
  habitants: Habitant[];
  /** Hidden input name, so the picker works inside `<Form>` / `fetcher.Form`. */
  name?: string;
  id?: string;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
};

/**
 * Picks a habitant with Favourites and Recently used first. Call `useSelections("habitant").recordUse(id)`
 * after the form saves, so the choice shows up under "Recently used" next time.
 */
export function HabitantPicker({ habitants, ...props }: HabitantPickerProps) {
  const { t } = useTranslation("household");
  return (
    <SelectionsPicker
      {...props}
      items={habitants.map((habitant) => ({
        id: habitant.id,
        label: habitant.name,
        description: t(`types.${habitant.type}`),
        leading: <HabitantAvatar habitant={habitant} size="sm" />,
      }))}
      entityType="habitant"
      waitForSelections
      awaitFavorite={false}
      favoriteFailedMessage={t("picker.favoriteFailed")}
    />
  );
}
