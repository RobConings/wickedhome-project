import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ApiRequestError } from "../lib/api-client";
import { parseForm, toFormResult, type FormResult } from "../lib/forms";
import {
  acceptInviteFormSchema,
  linkTokenSchema,
  resetPasswordFormSchema,
  type LinkKind,
  type LinkPreview,
} from "../types/accounts";
import type { SessionUser } from "../types/auth";
import { acceptInvite, lookupLink, resetPassword } from "./accounts-requests";
import { fetchCurrentUser, logout } from "./auth-requests";

/** Why a link page can't show the link: it doesn't exist, too many tries, or the server can't be reached. */
export type LinkProblem = "invalid" | "rateLimited" | "unavailable";

export type LinkLoaderData = {
  token: string;
  preview: LinkPreview | null;
  problem: LinkProblem | null;
  /** Someone is already logged in on this device. */
  currentUser: SessionUser | null;
};

export const LINK_ACCEPT_INTENT = "accept";
export const LINK_LOGOUT_INTENT = "logout";

/** `/invite/:token` and `/reset/:token` (public, outside the session layout). */
export async function linkLoader({ params }: LoaderFunctionArgs): Promise<LinkLoaderData> {
  const token = params.token ?? "";
  const currentUser = fetchCurrentUser().catch(() => null);
  if (!linkTokenSchema.safeParse(token).success) {
    return { token, preview: null, problem: "invalid", currentUser: await currentUser };
  }
  try {
    const preview = await lookupLink(token);
    return { token, preview, problem: null, currentUser: await currentUser };
  } catch (error) {
    const problem: LinkProblem =
      error instanceof ApiRequestError && error.status === 404
        ? "invalid"
        : error instanceof ApiRequestError && error.status === 429
          ? "rateLimited"
          : "unavailable";
    return { token, preview: null, problem, currentUser: await currentUser };
  }
}

export type LinkActionResult = FormResult & { intent?: string };

/** The confirmation check's code ("mismatch") becomes a translated message. */
function translateMismatch(errors: Record<string, string[]>): Record<string, string[]> {
  const confirm = errors.confirmPassword?.map((message) => (message === "mismatch" ? i18n.t("auth:link.passwordMismatch") : message));
  return confirm ? { ...errors, confirmPassword: confirm } : errors;
}

export async function linkAction({ request, params }: ActionFunctionArgs): Promise<LinkActionResult | Response> {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === LINK_LOGOUT_INTENT) {
    await logout();
    return { ok: true, intent: LINK_LOGOUT_INTENT };
  }

  formData.set("token", params.token ?? "");
  const kind = formData.get("kind") as LinkKind | null;
  const messages = {
    link_expired: i18n.t("auth:link.errors.expired"),
    link_used: i18n.t("auth:link.errors.used"),
    link_revoked: i18n.t("auth:link.errors.revoked"),
    not_found: i18n.t("auth:link.errors.invalid"),
    logged_in: i18n.t("auth:link.errors.loggedIn"),
  };

  try {
    if (kind === "password_reset") {
      const { data, errors } = parseForm(resetPasswordFormSchema, formData);
      if (errors) return { errors: translateMismatch(errors), intent: LINK_ACCEPT_INTENT };
      await resetPassword({ token: data.token, password: data.password });
    } else {
      const { data, errors } = parseForm(acceptInviteFormSchema, formData);
      if (errors) return { errors: translateMismatch(errors), intent: LINK_ACCEPT_INTENT };
      await acceptInvite({ token: data.token, email: data.email, password: data.password, locale: data.locale });
    }
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "email_taken") {
      return { errors: { email: [i18n.t("auth:link.errors.emailTaken")] }, intent: LINK_ACCEPT_INTENT };
    }
    return { ...toFormResult(error, messages), intent: LINK_ACCEPT_INTENT };
  }
  return redirect("/");
}
