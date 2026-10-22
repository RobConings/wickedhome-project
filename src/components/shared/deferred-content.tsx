import * as React from "react";
import { Await } from "react-router";

type DeferredContentProps<T> = {
  /** A value, a deferred loader promise (resolving to `null` when it failed), or `null` when it failed. */
  data: T | Promise<T | null> | null;
  /** Shown while the promise is pending: a skeleton shaped like the content. */
  fallback: React.ReactNode;
  /** Shown when the data failed to load. */
  failed: React.ReactNode;
  /** The content; `deferred` is true when the value came from a promise. */
  children: (value: T, deferred: boolean) => React.ReactNode;
};

/**
 * One card or section of a page whose data may still be loading (a deferred, un-awaited loader value) or
 * may have failed on its own (`optionalData`): skeleton, then the content or the failure text. Plain values
 * (stories, tests) render at once.
 */
export function DeferredContent<T>({ data, fallback, failed, children }: DeferredContentProps<T>) {
  if (data instanceof Promise) {
    return (
      <React.Suspense fallback={fallback}>
        <Await resolve={data} errorElement={failed}>
          {(resolved: T | null) => (resolved ? children(resolved, true) : failed)}
        </Await>
      </React.Suspense>
    );
  }
  return data === null ? failed : children(data, false);
}
