import * as React from "react";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

/**
 * Keeps the screen on while `enabled` (the cooking view), where the browser supports the Wake Lock API. The
 * browser drops the lock when the page is hidden; it is asked again when the page shows. Returns whether the
 * screen is being kept on, or "unsupported".
 */
export function useWakeLock(enabled: boolean): "on" | "off" | "unsupported" {
  const supported = typeof navigator !== "undefined" && Boolean((navigator as WakeLockNavigator).wakeLock);
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !supported) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      (navigator as WakeLockNavigator)
        .wakeLock!.request("screen")
        .then((lock) => {
          if (cancelled) {
            void lock.release();
            return;
          }
          sentinel = lock;
          setActive(true);
          lock.addEventListener("release", () => setActive(false));
        })
        // Refused (battery saver, no user gesture yet): the screen just behaves as usual.
        .catch(() => setActive(false));
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled, supported]);

  if (!supported) return "unsupported";
  return active ? "on" : "off";
}
