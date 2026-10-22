import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from "react-router";
import { parseForm, toFormResult, type FormResult } from "../lib/forms";
import { currentLocale, setLocale } from "@/lib/i18n";
import { loginInputSchema, setupInputSchema, type SessionUser } from "../types/auth";
import { fetchCurrentUser, fetchSetupStatus, login, logout, setupHousehold } from "./auth-requests";

/** Route id of the signed-in layout route; its loader data is the session. */
export const SESSION_ROUTE_ID = "session";

export type SessionLoaderData = { user: SessionUser };

/** Only allow redirects to paths inside the app. */
function safeRedirectTarget(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Guards every signed-in page: no session → login (or setup on a fresh install). */
export async function sessionLoader({ request }: LoaderFunctionArgs): Promise<SessionLoaderData> {
  const user = await fetchCurrentUser();
  if (!user) {
    const { needsSetup } = await fetchSetupStatus();
    if (needsSetup) throw redirect("/setup");
    const { pathname, search } = new URL(request.url);
    const target = pathname === "/" ? "" : `?redirectTo=${encodeURIComponent(pathname + search)}`;
    throw redirect(`/login${target}`);
  }
  if (user.locale !== currentLocale()) await setLocale(user.locale);
  return { user };
}

/**
 * The session is reloaded after submits and explicit revalidations, but not when a page only changes its
 * search params (a filter, tab or period): those then don't wait for an extra round trip.
 */
export function sessionShouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const onlySearchChanged = !formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search;
  return onlySearchChanged ? false : defaultShouldRevalidate;
}

export async function loginLoader() {
  const { needsSetup } = await fetchSetupStatus();
  if (needsSetup) throw redirect("/setup");
  if (await fetchCurrentUser()) throw redirect("/");
  return null;
}

export async function loginAction({ request }: ActionFunctionArgs): Promise<FormResult | Response> {
  const formData = await request.formData();
  const { data, errors } = parseForm(loginInputSchema, formData);
  if (errors) return { errors };

  try {
    await login(data);
  } catch (error) {
    return toFormResult(error, {
      unauthorized: i18n.t("auth:login.invalid"),
      account_disabled: i18n.t("auth:login.disabled"),
    });
  }
  return redirect(safeRedirectTarget(new URL(request.url).searchParams.get("redirectTo")));
}

export async function setupLoader() {
  const { needsSetup } = await fetchSetupStatus();
  if (!needsSetup) throw redirect("/login");
  return null;
}

export async function setupAction({ request }: ActionFunctionArgs): Promise<FormResult | Response> {
  const formData = await request.formData();
  const { data, errors } = parseForm(setupInputSchema, formData);
  if (errors) return { errors };

  try {
    await setupHousehold(data);
  } catch (error) {
    return toFormResult(error, { conflict: i18n.t("auth:setup.alreadyDone") });
  }
  return redirect("/");
}

export async function logoutAction() {
  await logout();
  return redirect("/login");
}
