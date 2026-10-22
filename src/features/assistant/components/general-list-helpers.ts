/**
 * Pure helpers behind `GeneralList`: search matching, the remembered list/tiles view and grouping. No React
 * here, so they are unit-tested in `general-list-helpers.test.ts`.
 */

export const LIST_VIEWS = ["list", "tiles"] as const;
export type ListView = (typeof LIST_VIEWS)[number];

/** Lowercase, without accents and with single spaces, so "Krëfel " finds "krefel" and "É" finds "e". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when every word of the query appears in at least one of the texts (accent and case insensitive).
 * "lena bday" matches ["Lena", "Birthday party"] only if both words are found; an empty query matches all.
 */
export function matchesSearch(texts: ReadonlyArray<string | number | null | undefined>, query: string): boolean {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts
    .filter((text): text is string | number => text !== null && text !== undefined && text !== "")
    .map((text) => normalizeSearchText(String(text)));
  return words.every((word) => haystack.some((text) => text.includes(word)));
}

/** Keeps the items whose texts match the query (see `matchesSearch`). */
export function filterBySearch<T>(
  items: readonly T[],
  query: string,
  getTexts: (item: T) => ReadonlyArray<string | number | null | undefined>,
): T[] {
  if (!normalizeSearchText(query)) return [...items];
  return items.filter((item) => matchesSearch(getTexts(item), query));
}

/** `"tiles"` → `"tiles"`; anything else (null, "grid", "") → `null`. Case and spaces are ignored. */
export function parseListView(value: unknown): ListView | null {
  if (typeof value !== "string") return null;
  const view = value.trim().toLowerCase();
  return (LIST_VIEWS as readonly string[]).includes(view) ? (view as ListView) : null;
}

/** The view to show: the URL (`?view=`) wins, then what this person picked before, then the list's default. */
export function resolveListView({
  urlValue,
  storedValue,
  defaultView,
}: {
  urlValue?: unknown;
  storedValue?: unknown;
  defaultView: ListView;
}): ListView {
  return parseListView(urlValue) ?? parseListView(storedValue) ?? defaultView;
}

/** localStorage key for a list's remembered view. */
export const listViewStorageKey = (storageKey: string) => `wh-list-view:${storageKey}`;

type ViewStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): ViewStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** The remembered view, or `null` when none is stored or storage is unavailable (private mode, Storybook…). */
export function readStoredListView(storageKey: string, storage: ViewStorage | undefined = browserStorage()): ListView | null {
  try {
    return parseListView(storage?.getItem(listViewStorageKey(storageKey)));
  } catch {
    return null;
  }
}

/** Remembers the view; silently does nothing when storage is unavailable or full. */
export function storeListView(storageKey: string, view: ListView, storage: ViewStorage | undefined = browserStorage()): void {
  try {
    storage?.setItem(listViewStorageKey(storageKey), view);
  } catch {
    // Not remembered on this device; the list still works.
  }
}

export type ListGroup<T> = { key: string; items: T[] };

/**
 * Splits items into groups, in `order` first (unknown keys after, in order of appearance). An item may
 * belong to several groups (e.g. "favourites" and its type). Empty groups are left out.
 */
export function groupListItems<T>(
  items: readonly T[],
  groupBy: (item: T) => string | readonly string[],
  order: readonly string[] = [],
): ListGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const key of order) groups.set(key, []);
  for (const item of items) {
    const keys = groupBy(item);
    for (const key of typeof keys === "string" ? [keys] : keys) {
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
  }
  return [...groups].filter(([, list]) => list.length > 0).map(([key, list]) => ({ key, items: list }));
}
