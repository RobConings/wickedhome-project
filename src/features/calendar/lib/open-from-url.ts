import * as React from "react";
import { useLocation, useSearchParams } from "react-router";

/**
 * The search param that asks a screen to open its create form right away: `/tasks?new=1`, `/bills?new=1`,
 * `/calendar?new=1`, `/shopping?new=1` (the global quick actions, "add" links on other pages). A screen with
 * a second form may use its own param with the same hooks (`/expenses?log=1` opens "Log an expense").
 */
export const NEW_FORM_PARAM = "new";

/** Removes `param` from the URL (replacing the history entry) as soon as it is there. */
function useConsumeParam(requested: boolean, param: string, onRequest?: () => void) {
  const [, setSearchParams] = useSearchParams();
  const onRequestRef = React.useRef(onRequest);
  React.useEffect(() => {
    onRequestRef.current = onRequest;
  });

  React.useEffect(() => {
    if (!requested) return;
    onRequestRef.current?.();
    setSearchParams(
      (params) => {
        params.delete(param);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [requested, param, setSearchParams]);
}

/**
 * Opens a create form when the URL asks for it (`?new=1`) and removes the param straight away (replacing
 * the history entry), so going back or refreshing doesn't open the form again. Other params (a pre-filled
 * place, a list) stay. Returns the open state and its setter for the dialog (`open` / `onOpenChange`).
 * Also works when the screen is already showing (a quick action picked on the same page).
 *
 * `enabled = false` (e.g. a child who can't create here) still removes the param but opens nothing.
 */
export function useOpenFromUrl(enabled = true, param: string = NEW_FORM_PARAM): [boolean, (open: boolean) => void] {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get(param) === "1";
  const [open, setOpen] = React.useState(enabled && requested);
  useConsumeParam(requested, param, () => {
    if (enabled) setOpen(true);
  });
  return [open, setOpen];
}

/**
 * For dialogs that manage their own open state (`defaultOpen`): returns a key that changes on every request
 * (`?log=1` in the URL, also when the screen is already showing), or `null` when nothing was asked. Render
 * the dialog with `key={request ?? "idle"}` and `defaultOpen={request !== null}`: every request mounts a
 * fresh, open dialog. The param is removed straight away, like `useOpenFromUrl`.
 */
export function useOpenRequestFromUrl(enabled = true, param: string = NEW_FORM_PARAM): string | null {
  const [searchParams] = useSearchParams();
  const { key } = useLocation();
  const requested = enabled && searchParams.get(param) === "1";
  const [request, setRequest] = React.useState<string | null>(requested ? key : null);
  // Each navigation has its own location key, so one request = one key (adjusting state during render).
  if (requested && request !== key) setRequest(key);
  useConsumeParam(searchParams.get(param) === "1", param);
  return request;
}
