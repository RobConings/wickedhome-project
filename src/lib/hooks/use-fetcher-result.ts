import * as React from "react";
import { toast } from "sonner";

/** The part of a `useFetcher()` these hooks read; any fetcher fits. */
type FetcherLike<T> = { state: "idle" | "loading" | "submitting"; data?: T };

/**
 * Calls `onResult` once for every new result of `fetcher` (when it is idle again after a submit), never twice
 * for the same result. The usual "saved → toast / close, failed → error toast" wiring of a fetcher form:
 *
 *   useFetcherResult(fetcher, (result) => (result.ok ? toast.success(t("saved")) : toast.error(result.formError ?? t("failed"))));
 */
export function useFetcherResult<T>(fetcher: FetcherLike<T>, onResult: (result: NonNullable<T>) => void): void {
  const handled = React.useRef<unknown>(undefined);
  const callback = React.useRef(onResult);
  React.useLayoutEffect(() => {
    callback.current = onResult;
  });
  React.useEffect(() => {
    const result = fetcher.state === "idle" ? fetcher.data : undefined;
    if (!result || result === handled.current) return;
    handled.current = result;
    callback.current(result);
  }, [fetcher.state, fetcher.data]);
}

/** Toasts the `formError` of a fetcher's result once it is idle (deletes, toggles and other one-click submits). */
export function useFetcherErrorToast(fetcher: FetcherLike<{ formError?: string } | null | undefined>): void {
  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);
}
