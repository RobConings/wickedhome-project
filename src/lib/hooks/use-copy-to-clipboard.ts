import * as React from "react";

/**
 * Copy text to the clipboard with a short "copied" state for the button (✓ for `resetMs`). `supported` is
 * false where the browser has no clipboard (plain-http LAN address, old browsers): hide the button then.
 */
export function useCopyToClipboard(resetMs = 1500) {
  const [copied, setCopied] = React.useState(false);
  const supported = typeof navigator !== "undefined" && Boolean(navigator.clipboard);
  const copy = (text: string) =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), resetMs);
    });
  return { supported, copied, copy };
}
