import * as React from "react";

export type Settled<T> = {
  /** The latest resolved value; the previous one stays while a newer promise is pending. */
  value: T | undefined;
  /** The latest promise rejected and there is no older value to show. */
  failed: boolean;
  /** A newer promise is still pending (also true before the first value). */
  pending: boolean;
};

/**
 * Follows a deferred loader value (a promise the loader didn't await) without suspending: at first
 * `value` is `undefined` (show a skeleton); after that the last value stays on screen while a revalidation
 * or a folder change brings a new promise. `<Suspense>`/`<Await>` would instead hold the whole navigation
 * until the slow part is there (router updates run in a transition), or blank the part on every reload.
 */
export function useSettled<T>(promise: Promise<T>): Settled<T> {
  const [state, setState] = React.useState<{ for: Promise<T> | null; value: T | undefined; failed: boolean }>({
    for: null,
    value: undefined,
    failed: false,
  });

  React.useEffect(() => {
    let current = true;
    promise.then(
      (value) => current && setState({ for: promise, value, failed: false }),
      () => current && setState((previous) => ({ for: promise, value: previous.value, failed: true })),
    );
    return () => {
      current = false;
    };
  }, [promise]);

  return {
    value: state.value,
    // A retry (new promise) shows the skeleton again instead of the old error.
    failed: state.failed && state.value === undefined && state.for === promise,
    pending: state.for !== promise,
  };
}

/** Marks a deferred promise as handled, so a rejection before anything renders it isn't reported as unhandled. */
export function deferred<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}
