import * as React from "react";
import type { ListView } from "@/components/shared/general-list";
import { matchesMedia, readStored, writeStored } from "@/lib/storage";

export type DocumentSortKey = "name" | "modified" | "size";
export type DocumentSort = { key: DocumentSortKey; direction: "asc" | "desc" };

/** Older versions also stored `view: "grid" | "list"` here; the list/tiles switch is now `GeneralList`'s. */
type Preference = { view?: string; sort: DocumentSort };

const STORAGE_KEY = "wh-documents-view";
const DEFAULT_SORT: DocumentSort = { key: "name", direction: "asc" };

function read(): Preference {
  try {
    const stored = JSON.parse(readStored(STORAGE_KEY) ?? "null") as Partial<Preference> | null;
    return {
      view: stored?.view,
      sort: stored?.sort && ["name", "modified", "size"].includes(stored.sort.key) ? stored.sort : DEFAULT_SORT,
    };
  } catch {
    return { sort: DEFAULT_SORT };
  }
}

/** The view before anyone picks one: an older grid/list choice carries over, else tiles from `md` up and a list on phones. */
function initialListView(storedView: string | undefined): ListView {
  if (storedView === "list") return "list";
  if (storedView === "grid") return "tiles";
  return matchesMedia("(min-width: 48rem)", true) ? "tiles" : "list";
}

/** The drive's sort order, remembered on this device, and the list/tiles view to start with. */
export function useDocumentView() {
  const [preference, setPreference] = React.useState<Preference>(read);
  const [defaultView] = React.useState(() => initialListView(preference.view));

  const setSort = React.useCallback((sort: DocumentSort) => {
    setPreference((current) => {
      const merged = { ...current, sort };
      writeStored(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  return { sort: preference.sort, setSort, defaultView };
}
