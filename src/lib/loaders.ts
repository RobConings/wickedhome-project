import { data, type ShouldRevalidateFunction } from "react-router";
import { ApiRequestError } from "./api-client";

/**
 * Route-data helpers shared by every feature's `data/*-loaders.ts`. Before writing loader or action
 * boilerplate in a feature, look here (and in `forms.ts` for actions).
 */

/** Rethrows an API 404 as a route 404 (the not-found page); anything else is rethrown as is. */
export function notFoundAs404(error: unknown): never {
  if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
  throw error;
}

/** Awaits `request`; a missing record (or one of another household) shows the not-found page. */
export async function orNotFound<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    return notFoundAs404(error);
  }
}

/**
 * The URL's search string without `params` (optionally sorted), for `shouldRevalidate` functions that
 * skip reloading when only client-side params changed.
 */
export function searchWithout(url: URL, params: readonly string[], options: { sort?: boolean } = {}): string {
  const search = new URLSearchParams(url.search);
  for (const param of params) search.delete(param);
  if (options.sort) search.sort();
  return search.toString();
}

/**
 * A `shouldRevalidate` for screens whose `params` only filter or switch what is already loaded: changing only
 * those (on the same path, without a submit) doesn't reload. `sort` ignores the order of the other params;
 * `revalidateSameUrl` still reloads on an explicit `revalidate()` of the same address.
 */
export function revalidateUnlessOnly(
  params: readonly string[],
  options: { sort?: boolean; revalidateSameUrl?: boolean } = {},
): ShouldRevalidateFunction {
  return ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
    if (formMethod || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
    if (options.revalidateSameUrl && currentUrl.href === nextUrl.href) return defaultShouldRevalidate;
    return searchWithout(currentUrl, params, options) === searchWithout(nextUrl, params, options) ? false : defaultShouldRevalidate;
  };
}

/**
 * A part of the page that may fail on its own (a card, a section, another feature's data): resolves with
 * `null` instead of rejecting. With a `label`, the failure is logged as "<label> could not load".
 */
export function optionalData<T>(promise: Promise<T>, label?: string): Promise<T | null> {
  return promise.catch((error: unknown) => {
    if (label) console.warn(`${label} could not load`, error);
    return null;
  });
}
