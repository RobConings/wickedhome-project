import * as React from "react";
import { isLookupBarcode, type BarcodeLookupResult, type BarcodeLookupStatus, type ProductSuggestion } from "../types/barcode-lookup";
import { lookupBarcode } from "./shopping-requests";

export type BarcodeAutofill =
  | { status: "idle" }
  | { status: "loading"; code: string }
  | { status: BarcodeLookupStatus; code: string; suggestion: ProductSuggestion | null };

type Options = {
  /** Don't look these codes up (the product's own barcode, a code whose suggestion was already applied). */
  skip?: (code: string) => boolean;
  /** Defaults to the API (stories pass a fake). */
  lookup?: (code: string) => Promise<BarcodeLookupResult>;
  /** Wait this long after the last keystroke. */
  delayMs?: number;
};

/**
 * Looks a typed barcode up once it is a valid EAN/UPC (debounced). The answer only shows while the field
 * still holds that code; a failed request counts as `unavailable`, never as an error.
 */
export function useBarcodeAutofill(rawCode: string, { skip, lookup = lookupBarcode, delayMs = 500 }: Options = {}): BarcodeAutofill {
  const code = rawCode.trim();
  const wanted = isLookupBarcode(code) && !skip?.(code);
  const [state, setState] = React.useState<Exclude<BarcodeAutofill, { status: "idle" }> | null>(null);
  const lookupRef = React.useRef(lookup);
  React.useEffect(() => {
    lookupRef.current = lookup;
  });

  React.useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setState({ status: "loading", code });
      lookupRef.current(code).then(
        (result) => {
          if (!cancelled) setState({ status: result.status, code, suggestion: result.suggestion });
        },
        () => {
          if (!cancelled) setState({ status: "unavailable", code, suggestion: null });
        },
      );
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, wanted, delayMs]);

  return wanted && state?.code === code ? state : { status: "idle" };
}
