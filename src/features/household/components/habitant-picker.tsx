import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker } from "./entity-picker";
import { useSelections } from "@/lib/selections";
import type { Habitant } from "../types/household";
import { HabitantAvatar } from "./habitant-avatar";

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
  const { favoriteIds, recentIds, toggleFavorite, loading } = useSelections("habitant");
  return (
    <EntityPicker
      {...props}
      items={habitants.map((habitant) => ({
        id: habitant.id,
        label: habitant.name,
        description: t(`types.${habitant.type}`),
        leading: <HabitantAvatar habitant={habitant} size="sm" />,
      }))}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      loading={loading}
      onToggleFavorite={(id) => void toggleFavorite(id).catch(() => toast.error(t("picker.favoriteFailed")))}
    />
  );
}
