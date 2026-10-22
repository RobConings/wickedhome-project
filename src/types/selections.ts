import { z } from "zod";
import { idSchema } from "./common";

/**
 * Kinds of items a picker can remember (favourites and recently used). Adding a domain with a picker?
 * Add its entity type here; the API and the `useSelections` hook accept it immediately.
 */
export const SELECTION_ENTITY_TYPES = [
  "shop",
  "place",
  "product",
  "habitant",
  "appliance",
  "payee",
  "subscription",
  "task",
  "device",
  "project",
  "contact",
  "recipe",
] as const;
export const selectionEntityTypeSchema = z.enum(SELECTION_ENTITY_TYPES);
export type SelectionEntityType = z.infer<typeof selectionEntityTypeSchema>;

/** At most this many recently used items are kept per user and entity type. */
export const MAX_RECENT_SELECTIONS = 20;

/** Body of `POST /api/selections/favorites` and `POST /api/selections/recent`. */
export const selectionRefSchema = z.object({
  entityType: selectionEntityTypeSchema,
  entityId: idSchema,
});
export type SelectionRef = z.infer<typeof selectionRefSchema>;

export type RecentSelection = {
  entityId: string;
  useCount: number;
  /** ISO timestamp */
  lastUsedAt: string;
};

/** `GET /api/selections/:entityType`: the current user's favourites and recents for one entity type. */
export type Selections = {
  entityType: SelectionEntityType;
  favoriteIds: string[];
  /** Most recently used first, at most `MAX_RECENT_SELECTIONS`. */
  recents: RecentSelection[];
};
