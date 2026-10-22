import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useMatches, type Params } from "react-router";
import type { ScreenContext } from "@/types/screen-context";

/**
 * Screen context for the assistant (ai/docs/ASSISTANT.md, "Screen context"): pages say what they show through
 * the React Router `handle` of their thin route file, the app frame hands the deepest one to the Ask sheet.
 *
 *   // src/routes/task-detail.tsx: a detail page, with the record's id and name
 *   export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "task", id: data.detail.task.id, label: data.detail.task.title }));
 *   // src/routes/tasks.tsx: an overview page, only the area
 *   export const handle = screenHandle(({ t }) => ({ kind: "tasks", label: t("nav.tasks") }));
 *
 * The kind must be registered on the server (`registerScreenContext`, ai/core/screen-context.ts); the label
 * is only for the chip, the server looks the record up itself. Pages without a sensible context (settings,
 * login, the assistant) declare nothing.
 */

type AnyLoader = (...args: never[]) => unknown;

export type ScreenHandleArgs<Data> = {
  params: Params;
  /** The route's loader data. Undefined on an error page: reading from it throws, which means "no screen". */
  data: Data;
  /** The app's `common` texts (`nav.*` for overview labels). */
  t: TFunction;
};

export type ScreenHandle = { screen: (args: ScreenHandleArgs<unknown>) => ScreenContext | null };

/** A route's `handle` declaring its screen. `Loader`: the route's loader, so `data` is typed. */
export function screenHandle<Loader extends AnyLoader = () => undefined>(
  screen: (args: ScreenHandleArgs<Awaited<ReturnType<Loader>>>) => ScreenContext | null,
): ScreenHandle {
  return { screen: screen as ScreenHandle["screen"] };
}

const isScreenHandle = (handle: unknown): handle is ScreenHandle => typeof (handle as Partial<ScreenHandle> | null)?.screen === "function";

/** The screen of the deepest matched route that declares one, or null. */
export function useScreenContext(): ScreenContext | null {
  const matches = useMatches();
  const { t } = useTranslation();
  for (const match of [...matches].reverse()) {
    if (!isScreenHandle(match.handle)) continue;
    try {
      const screen = match.handle.screen({ params: match.params, data: match.loaderData, t });
      return screen?.label ? screen : null;
    } catch {
      // No data in the expected shape (an error page): no context rather than a broken frame.
      return null;
    }
  }
  return null;
}
