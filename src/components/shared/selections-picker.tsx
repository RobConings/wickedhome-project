import type * as React from "react";
import { toast } from "sonner";
import { useSelections, type UseSelectionsOptions } from "@/lib/selections";
import type { SelectionEntityType } from "@/types/selections";
import { EntityPicker } from "./entity-picker";

type EntityPickerProps = React.ComponentProps<typeof EntityPicker>;

/** What a feature's `<Thing>Picker` accepts on top of its own items. */
export type SelectionsPickerBaseProps = Omit<EntityPickerProps, "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"> & {
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

type SelectionsPickerProps = SelectionsPickerBaseProps & {
  entityType: SelectionEntityType;
  items: EntityPickerProps["items"];
  /** Toast when (un)starring fails; failures are silent without it. */
  favoriteFailedMessage?: string;
  /** Keep the star busy until the favourite is saved (default) instead of firing and forgetting. */
  awaitFavorite?: boolean;
  /** Show placeholders until the favourites and recents are known too (they arrive separately from the items). */
  waitForSelections?: boolean;
};

/**
 * `EntityPicker` wired to the current user's favourites and recently used items of one entity type
 * (`useSelections`). Every feature picker (shops, places, products, contacts…) is this plus its items:
 *
 *   <SelectionsPicker entityType="shop" items={items} favoriteFailedMessage={t("favorite.failed")} {...props} />
 *
 * After the form saves, call `useSelections(entityType).recordUse(id)`.
 */
export function SelectionsPicker({
  entityType,
  items,
  initialSelections,
  favoriteFailedMessage,
  awaitFavorite = true,
  waitForSelections = false,
  loading,
  ...props
}: SelectionsPickerProps) {
  const selections = useSelections(entityType, { initial: initialSelections });
  const { favoriteIds, recentIds, toggleFavorite } = selections;
  const toggle = (id: string) =>
    toggleFavorite(id).catch(() => (favoriteFailedMessage === undefined ? undefined : toast.error(favoriteFailedMessage)));

  return (
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      loading={waitForSelections ? loading || selections.loading : loading}
      onToggleFavorite={awaitFavorite ? toggle : (id) => void toggle(id)}
    />
  );
}
