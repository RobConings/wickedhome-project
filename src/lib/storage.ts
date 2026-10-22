/**
 * Per-device preferences in localStorage. Storage can be missing or blocked (private mode, Storybook, tests,
 * a full quota): reads then give `null` and writes do nothing, so a feature never needs its own try/catch.
 */

/** The stored string, or `null` when there is none or storage is unavailable. */
export function readStored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Stores `value` (or removes the key for `null`); silently does nothing when storage is unavailable. */
export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Not remembered on this device; the feature still works for this visit.
  }
}

/** A remembered on/off switch ("1"/"0"); `false` until set. */
export const readStoredFlag = (key: string) => readStored(key) === "1";
export const writeStoredFlag = (key: string, value: boolean) => writeStored(key, value ? "1" : "0");

/** Whether a media query matches right now; `fallback` where `matchMedia` is unavailable. */
export function matchesMedia(query: string, fallback = false): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return fallback;
  }
}
