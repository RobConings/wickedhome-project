import { z } from "zod";
import { idSchema } from "./common";

/**
 * Screen context (ai/docs/ASSISTANT.md, "Screen context"): the page the assistant was opened from, so "this",
 * "here" and "add it" refer to what is on the screen.
 *
 * - A page declares it in its thin route file: `export const handle = screenHandle<typeof loader>(…)`
 *   (`@/lib/screen-context`), returning a `ScreenContext` from the route's params and loader data.
 * - The chat sends only the `ScreenRef` (`{ kind, id? }`) with a question; the server looks the thing up
 *   itself (household-scoped, `registerScreenContext` in ai/core/screen-context.ts) and ignores unknown kinds
 *   and ids that aren't the household's.
 *
 * `kind` is an open name (a skill registers the kinds it knows): the singular entity for a detail page
 * (`product`, `task`, `recurring_expense`…), the area for an overview page (`shopping`, `tasks`…).
 */

export const screenKindSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);

/** What the chat sends with a question. */
export const screenRefSchema = z.object({
  kind: screenKindSchema,
  /** The record shown on a detail page; absent on an overview page. */
  id: idSchema.optional(),
});
export type ScreenRef = z.infer<typeof screenRefSchema>;

/** What a page declares and what the chat shows on its chip: the reference plus a short label ("Spaghetti"). */
export type ScreenContext = ScreenRef & {
  /** In the person's language; the page's title or the record's name. */
  label: string;
};
