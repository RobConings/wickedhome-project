import * as React from "react";
import {
  MAX_RECENT_SELECTIONS,
  type SelectionEntityType,
  type Selections,
} from "@/types/selections";
import { api } from "./api-client";

// ── Requests ────────────────────────────────────────────────────────────────────────────────────────

export const fetchSelections = (entityType: SelectionEntityType) =>
  api.get<Selections>(`/selections/${entityType}`);
export const addFavorite = (entityType: SelectionEntityType, entityId: string) =>
  api.post("/selections/favorites", { entityType, entityId });
export const removeFavorite = (entityType: SelectionEntityType, entityId: string) =>
  api.delete(`/selections/favorites/${entityType}/${encodeURIComponent(entityId)}`);
/** Call when a selection is saved, so the item shows up under "Recently used" next time. */
export const recordSelection = (entityType: SelectionEntityType, entityId: string) =>
  api.post("/selections/recent", { entityType, entityId });

// ── Store ───────────────────────────────────────────────────────────────────────────────────────────
// One small store per entity type, shared by every picker and star on the page, so starring a shop in
// one place updates all of them. Loaded once on first use.

export type SelectionsSnapshot = {
  favoriteIds: string[];
  /** Most recently used first. */
  recentIds: string[];
  status: "idle" | "loading" | "ready" | "error";
};

class SelectionsStore {
  private state: SelectionsSnapshot = { favoriteIds: [], recentIds: [], status: "idle" };
  private listeners = new Set<() => void>();

  constructor(private readonly entityType: SelectionEntityType) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<SelectionsSnapshot>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /** Fills the store without fetching (stories, tests, or data that came with a loader). */
  seed(data: { favoriteIds?: string[]; recentIds?: string[] }) {
    this.set({ favoriteIds: data.favoriteIds ?? [], recentIds: data.recentIds ?? [], status: "ready" });
  }

  async load() {
    if (this.state.status !== "idle") return;
    this.set({ status: "loading" });
    try {
      const data = await fetchSelections(this.entityType);
      this.set({
        favoriteIds: data.favoriteIds,
        recentIds: data.recents.map((recent) => recent.entityId),
        status: "ready",
      });
    } catch {
      // Pickers still work without favourites; try again on the next mount.
      this.set({ status: "error" });
    }
  }

  async toggleFavorite(id: string) {
    const previous = this.state.favoriteIds;
    const isFavorite = previous.includes(id);
    this.set({ favoriteIds: isFavorite ? previous.filter((value) => value !== id) : [...previous, id] });
    try {
      await (isFavorite ? removeFavorite(this.entityType, id) : addFavorite(this.entityType, id));
    } catch (error) {
      this.set({ favoriteIds: previous });
      throw error;
    }
  }

  async recordUse(id: string) {
    const previous = this.state.recentIds;
    this.set({ recentIds: [id, ...previous.filter((value) => value !== id)].slice(0, MAX_RECENT_SELECTIONS) });
    try {
      await recordSelection(this.entityType, id);
    } catch {
      // Not worth bothering the user about; the list is just a convenience.
      this.set({ recentIds: previous });
    }
  }

  retryIfFailed() {
    if (this.state.status === "error") this.set({ status: "idle" });
  }
}

const stores = new Map<SelectionEntityType, SelectionsStore>();

function getStore(entityType: SelectionEntityType) {
  let store = stores.get(entityType);
  if (!store) {
    store = new SelectionsStore(entityType);
    stores.set(entityType, store);
  }
  return store;
}

// ── Hook ────────────────────────────────────────────────────────────────────────────────────────────

export type UseSelectionsOptions = {
  /** Seed data instead of fetching (stories, tests). */
  initial?: { favoriteIds?: string[]; recentIds?: string[] };
};

/**
 * The current user's favourites and recently used items for one entity type, for `EntityPicker`.
 * `toggleFavorite` and `recordUse` update the UI immediately and roll back if the request fails.
 */
export function useSelections(entityType: SelectionEntityType, { initial }: UseSelectionsOptions = {}) {
  const store = getStore(entityType);
  const [seeded] = React.useState(() => {
    if (initial) store.seed(initial);
    return Boolean(initial);
  });
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  React.useEffect(() => {
    if (seeded) return;
    store.retryIfFailed();
    void store.load();
  }, [store, seeded]);

  const toggleFavorite = React.useCallback((id: string) => store.toggleFavorite(id), [store]);
  const recordUse = React.useCallback((id: string) => store.recordUse(id), [store]);

  return {
    favoriteIds: snapshot.favoriteIds,
    recentIds: snapshot.recentIds,
    loading: snapshot.status === "loading" || snapshot.status === "idle",
    toggleFavorite,
    recordUse,
  };
}
