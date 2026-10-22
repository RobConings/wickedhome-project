import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FavoriteToggle } from "./favorite-toggle";

export type EntityPickerItem = {
  id: string;
  label: string;
  /** Second line, e.g. a type or address. Also searched. */
  description?: string;
  /** Icon, avatar or logo before the label. */
  leading?: React.ReactNode;
  /** Extra search terms (synonyms, codes). */
  keywords?: string[];
};

export type EntityPickerLabels = {
  favorites: string;
  recent: string;
  all: string;
  empty: string;
  search: string;
  placeholder: string;
  addFavorite: string;
  removeFavorite: string;
  clear: string;
  loading: string;
};

type EntityPickerProps = {
  items: EntityPickerItem[];
  /** Controlled value (selected item id). Use with `onChange`. */
  value?: string | null;
  /** Uncontrolled initial value, e.g. in a native form. */
  defaultValue?: string | null;
  /**
   * Return a promise when choosing saves right away (an inline select): the trigger shows a spinner and
   * is disabled until it settles. An uncontrolled picker goes back to its old value if the promise rejects.
   */
  onChange?: (id: string | null) => void | Promise<unknown>;
  /** Renders a hidden input with this name, so the picker works in `<Form>` / native forms. */
  name?: string;
  /** Id of the trigger button, for `<label htmlFor>`. */
  id?: string;
  favoriteIds?: string[];
  /** Most recently used first. */
  recentIds?: string[];
  /** Shows a star per item when given. A returned promise keeps the star in its new state until it settles. */
  onToggleFavorite?: (id: string) => void | Promise<unknown>;
  /** How many recently used items to show. */
  maxRecent?: number;
  /** Show a button that clears the selection. */
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /**
   * The items, favourites or recents are still loading: the list shows placeholder rows (or a loading line
   * above the items already there) and, while the selected item is unknown, the trigger shows a spinner.
   */
  loading?: boolean;
  /** Something is being saved for this picker (e.g. a fetcher after a choice): spinner in the trigger, disabled. */
  busy?: boolean;
  /** Trigger text when nothing is selected (defaults to `common:picker.placeholder`). */
  placeholder?: string;
  /** Override any of the generic labels from the `common` namespace. */
  labels?: Partial<EntityPickerLabels>;
  className?: string;
};

/** Lowercase without accents, so "krefel" finds "Krëfel". */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const matches = (item: EntityPickerItem, query: string) =>
  [item.label, item.description ?? "", ...(item.keywords ?? [])].some((text) => normalize(text).includes(query));

const SMALL_SCREEN = "(max-width: 639px)";

function useIsSmallScreen() {
  return React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(SMALL_SCREEN);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(SMALL_SCREEN).matches,
    () => false,
  );
}

/**
 * Searchable single-select for any kind of entity. The list shows Favourites, then Recently used, then
 * All (alphabetical). On small screens it opens as a bottom sheet. Alt+Enter stars the highlighted item.
 */
export function EntityPicker({
  items,
  value: controlledValue,
  defaultValue = null,
  onChange,
  name,
  id,
  favoriteIds = [],
  recentIds = [],
  onToggleFavorite,
  maxRecent = 5,
  clearable = false,
  disabled = false,
  invalid = false,
  loading = false,
  busy = false,
  placeholder,
  labels: labelOverrides,
  className,
}: EntityPickerProps) {
  const { t } = useTranslation();
  const labels: EntityPickerLabels = {
    favorites: t("picker.favorites"),
    recent: t("picker.recent"),
    all: t("picker.all"),
    empty: t("picker.empty"),
    search: t("picker.search"),
    placeholder: placeholder ?? t("picker.placeholder"),
    addFavorite: t("picker.addFavorite"),
    removeFavorite: t("picker.removeFavorite"),
    clear: t("picker.clear"),
    loading: t("picker.loading"),
    ...labelOverrides,
  };

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState("");
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  // True while a promise returned by `onChange` is pending.
  const [saving, setSaving] = React.useState(false);
  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;
  const small = useIsSmallScreen();

  const selected = items.find((item) => item.id === value);

  const groups = React.useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const favoriteSet = new Set(favoriteIds);
    const pick = (ids: string[]) => ids.flatMap((itemId) => byId.get(itemId) ?? []);
    const byLabel = (a: EntityPickerItem, b: EntityPickerItem) => a.label.localeCompare(b.label);

    const favorites = pick(favoriteIds).sort(byLabel);
    const recent = pick(recentIds.filter((itemId) => !favoriteSet.has(itemId))).slice(0, maxRecent);
    const all = [...items].sort(byLabel);

    const search = normalize(query.trim());
    if (!search) return { favorites, recent, all };

    // While searching, show each match once: in the first group it belongs to.
    const shown = new Set<string>();
    const filter = (list: EntityPickerItem[]) =>
      list.filter((item) => !shown.has(item.id) && matches(item, search) && shown.add(item.id));
    return { favorites: filter(favorites), recent: filter(recent), all: filter(all) };
  }, [items, favoriteIds, recentIds, maxRecent, query]);

  const working = busy || saving;
  // A value whose item hasn't arrived yet: say so instead of showing the placeholder.
  const resolving = loading && Boolean(value) && !selected;

  function select(itemId: string | null) {
    const previous = value;
    if (controlledValue === undefined) setUncontrolledValue(itemId);
    const result = onChange?.(itemId);
    setOpen(false);
    if (!(result instanceof Promise)) return;
    setSaving(true);
    result.then(
      () => setSaving(false),
      () => {
        setSaving(false);
        if (controlledValue === undefined) setUncontrolledValue(previous);
      },
    );
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && event.altKey && onToggleFavorite && highlighted) {
      event.preventDefault();
      onToggleFavorite(highlighted.slice(highlighted.indexOf(":") + 1));
    }
  }

  const renderGroup = (key: string, heading: string, list: EntityPickerItem[]) =>
    list.length > 0 && (
      <CommandGroup heading={heading}>
        {list.map((item) => {
          const isFavorite = favoriteIds.includes(item.id);
          return (
            <CommandItem
              key={`${key}:${item.id}`}
              value={`${key}:${item.id}`}
              onSelect={() => select(item.id)}
              className="gap-3 py-2 pointer-coarse:py-3"
            >
              {item.leading && <span className="flex shrink-0 items-center">{item.leading}</span>}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{item.label}</span>
                {item.description && (
                  <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                )}
              </span>
              <CheckIcon className={cn("text-primary", item.id === value ? "opacity-100" : "opacity-0")} />
              {onToggleFavorite && (
                <FavoriteToggle
                  active={isFavorite}
                  label={isFavorite ? labels.removeFavorite : labels.addFavorite}
                  size="sm"
                  // Clicks on the star must not select the item; the input keeps focus.
                  tabIndex={-1}
                  className="-my-1 -mr-1"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => event.stopPropagation()}
                  onToggle={() => onToggleFavorite(item.id)}
                />
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>
    );

  const list = (
    <Command
      shouldFilter={false}
      value={highlighted}
      onValueChange={setHighlighted}
      onKeyDown={handleKeyDown}
      className="bg-transparent"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={labels.search}
        className="pointer-coarse:text-base"
      />
      <CommandList className="max-h-[min(22rem,var(--radix-popover-content-available-height,60vh))] max-sm:max-h-[60vh]">
        {!loading && <CommandEmpty>{labels.empty}</CommandEmpty>}
        {loading && (
          <div role="status" aria-label={labels.loading} className="px-2 py-1.5">
            {items.length === 0 ? (
              <div aria-hidden className="flex flex-col gap-1">
                {[60, 45, 70, 50].map((width) => (
                  <div key={width} className="flex items-center gap-3 px-2 py-2">
                    <Skeleton className="size-5 shrink-0 rounded" />
                    <Skeleton className="h-4" style={{ width: `${width}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                {labels.loading}
              </div>
            )}
          </div>
        )}
        {renderGroup("favorites", labels.favorites, groups.favorites)}
        {renderGroup("recent", labels.recent, groups.recent)}
        {renderGroup("all", labels.all, groups.all)}
      </CommandList>
    </Command>
  );

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      aria-busy={working || resolving || undefined}
      disabled={disabled || working}
      className="w-full justify-between gap-2 px-3 font-normal"
      onClick={small ? () => handleOpenChange(true) : undefined}
    >
      {selected ? (
        <span className={cn("flex min-w-0 items-center gap-2", clearable && "pr-7")}>
          {selected.leading && <span className="flex shrink-0 items-center">{selected.leading}</span>}
          <span className="truncate">{selected.label}</span>
        </span>
      ) : (
        <span className="truncate text-muted-foreground">{resolving ? labels.loading : labels.placeholder}</span>
      )}
      {working || resolving ? (
        <Spinner className="text-muted-foreground" />
      ) : (
        <ChevronsUpDownIcon className="opacity-50" />
      )}
    </Button>
  );

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      {small ? (
        <>
          {trigger}
          <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent
              side="bottom"
              className="gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
              // Show the list first; focusing the search would cover it with the keyboard.
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{labels.placeholder}</SheetTitle>
                <SheetDescription>{labels.search}</SheetDescription>
              </SheetHeader>
              <div className="pt-10">{list}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-(--radix-popover-trigger-width) min-w-64 p-0"
          >
            {list}
          </PopoverContent>
        </Popover>
      )}
      {clearable && selected && !disabled && !working && (
        <button
          type="button"
          aria-label={labels.clear}
          className="absolute top-1/2 right-8 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
          onClick={() => select(null)}
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
