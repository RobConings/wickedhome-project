import { z } from "zod";
import { localeSchema, type Locale } from "@/types/common";

export const ROLES = ["owner", "adult", "child"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const emailSchema = z.email().max(254).transform((value) => value.toLowerCase());
/** The password policy for every new password (setup, invites, resets, changes). */
export const passwordSchema = z.string().min(10).max(200);

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** First-run setup: creates the household and its owner in one go. */
export const setupInputSchema = z.object({
  householdName: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(60),
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema,
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const updateAccountInputSchema = z.object({
  locale: localeSchema,
});
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

export type SetupStatus = {
  needsSetup: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
  householdId: string;
  householdName: string;
  habitantId: string | null;
};
