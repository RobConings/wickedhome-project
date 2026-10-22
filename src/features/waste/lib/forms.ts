import i18n from "i18next";
import type { z } from "zod";
import { ApiRequestError } from "./api-client";

/** What a route action returns when it does not redirect. */
export type FormResult = {
  ok?: boolean;
  /** Field-level messages, keyed by field name. */
  errors?: Record<string, string[]>;
  /** Message for the form as a whole. */
  formError?: string;
};

/** Turns FormData into a plain object; empty strings become `undefined` so optional fields validate. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value.trim() === "" ? undefined : value;
  }
  return result;
}

export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { data: z.infer<T>; errors?: undefined } | { data?: undefined; errors: Record<string, string[]> } {
  const result = schema.safeParse(formDataToObject(formData));
  if (result.success) return { data: result.data };

  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { errors };
}

/**
 * Maps a failed API call to a FormResult. Pass translated messages for the error codes the caller
 * expects (e.g. `{ unauthorized: t("login.invalid") }`); anything else gets a generic message.
 */
export function toFormResult(error: unknown, messages: Record<string, string> = {}): FormResult {
  if (!(error instanceof ApiRequestError)) throw error;
  if (error.fields) return { errors: error.fields };
  return {
    formError:
      messages[error.code] ??
      (error.status === 429 ? i18n.t("common:errors.tooManyAttempts") : i18n.t("common:errors.generic")),
  };
}
