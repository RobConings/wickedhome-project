import { useLocation, useNavigation, useRevalidator } from "react-router";

/**
 * Pending-state hooks for screens. Navigations to another page are covered by the frame's top bar;
 * these are for the cases where the screen itself should react.
 */

/** True while any navigation, form submission or revalidation is in flight (drives the top bar). */
export function useAppBusy(): boolean {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  return navigation.state !== "idle" || revalidator.state !== "idle";
}

/**
 * True while this same page reloads with other search params (a new period, filter, tab, folder in the
 * same route) or revalidates after a submit. Wrap the affected content in `PendingContent`.
 */
export function useSamePagePending(): boolean {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const location = useLocation();
  if (revalidator.state !== "idle") return true;
  return navigation.state !== "idle" && navigation.location?.pathname === location.pathname;
}

/** True while a `<Form>` on this page is submitting, optionally only for one `intent` value. */
export function useIsSubmitting(intent?: string): boolean {
  const navigation = useNavigation();
  if (navigation.state !== "submitting") return false;
  return intent === undefined || navigation.formData?.get("intent") === intent;
}
