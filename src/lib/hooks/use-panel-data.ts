import * as React from "react";

export type PanelDataState<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

type UsePanelDataOptions<T> = {
  /** Seed data (stories, tests, or what a loader already had): no first fetch. */
  initialData?: T;
  /** After a failed reload, keep showing the data that was there (instead of the error state). */
  keepDataOnError?: boolean;
};

/**
 * Data for a panel or section that loads its own (a project's tasks, a room's appliances): `loading` →
 * `ready` / `error`, stale responses ignored, and `reload()` (sets `refreshing` until the new data is in)
 * or `retry()`. `deps` are what `load` depends on (ids), like `useEffect` deps.
 *
 *   const { state, reload } = usePanelData(() => fetchAppliances(), [], { initialData });
 */
export function usePanelData<T>(load: () => Promise<T>, deps: React.DependencyList, options: UsePanelDataOptions<T> = {}) {
  const { initialData, keepDataOnError = false } = options;
  const [state, setState] = React.useState<PanelDataState<T>>(() =>
    initialData ? { status: "ready", data: initialData } : { status: "loading" },
  );
  const [reloads, setReloads] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const loadRef = React.useRef(load);
  React.useLayoutEffect(() => {
    loadRef.current = load;
  });

  React.useEffect(() => {
    if (initialData && reloads === 0) return;
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState((previous) => (keepDataOnError && previous.status === "ready" ? previous : { status: "error" }));
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
    // `deps` stand in for `load`, which is a new function on every render.
  }, [reloads, initialData, keepDataOnError, ...deps]);

  const reload = React.useCallback(() => {
    setRefreshing(true);
    setReloads((value) => value + 1);
  }, []);
  const retry = React.useCallback(() => setReloads((value) => value + 1), []);

  return { state, setState, reload, retry, refreshing };
}
