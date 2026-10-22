import * as React from "react";

/** Whether a CSS media query matches, kept current. `serverValue` is used where there is no window (SSR, tests). */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
