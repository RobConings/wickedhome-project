import { z } from "zod";
import { hexColorSchema, idSchema, localeSchema } from "@/types/common";
import { emailSchema, passwordSchema, roleSchema, type Role } from "./auth";

/**
 * Contracts for household accounts: invite links, password-reset links, the Accounts list (owners and
 * adults) and "My account" (everyone). See docs/ACCOUNTS.md.
 */

/** Habitant types that can get an account. Pets can't log in. */
export const ACCOUNT_HABITANT_TYPES = ["adult", "child", "guest"] as const;

/** A random 32-byte token, base64url without padding: what follows `/invite/` or `/reset/` in a link. */
export const linkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const LINK_KINDS = ["invite", "password_reset"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** The path of a link's page; the browser puts `window.location.origin` in front. */
export const linkPath = (kind: LinkKind, token: string) => `/${kind === "invite" ? "invite" : "reset"}/${token}`;

// ── Creating links ───────────────────────────────────────────────────────────

export const newInviteHabitantSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(ACCOUNT_HABITANT_TYPES),
  color: hexColorSchema,
});

/** Invite an existing habitant without an account (`habitantId`), or a new person (`newHabitant`). */
export const createInviteInputSchema = z
  .object({
    habitantId: idSchema.optional(),
    newHabitant: newInviteHabitantSchema.optional(),
    role: roleSchema,
  })
  .refine((value) => Boolean(value.habitantId) !== Boolean(value.newHabitant), {
    message: "Pick a person or add a new one",
    path: ["habitantId"],
  });
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

export const changeRoleInputSchema = z.object({ role: roleSchema });
export type ChangeRoleInput = z.infer<typeof changeRoleInputSchema>;

/** A freshly made link. The raw token exists only in this response and in the link itself. */
export type CreatedLink = {
  kind: LinkKind;
  token: string;
  /** ISO timestamp. */
  expiresAt: string;
};

export type CreatedInvite = CreatedLink & { invite: PendingInvite };

// ── Opening a link (public) ──────────────────────────────────────────────────

export const linkLookupInputSchema = z.object({ token: linkTokenSchema });

export type LinkStatus = "valid" | "expired" | "used" | "revoked";

/**
 * What the link page shows. A link that is no longer usable only says why and who made it ("ask Rob for a
 * new link"); the household and person are only shown for a usable one.
 */
export type LinkPreview =
  | {
      status: "valid";
      kind: LinkKind;
      householdName: string;
      /** The person the account is for (the habitant's name, or the account's name for a reset). */
      name: string;
      role: Role;
      /** Password reset: the account's email. */
      email: string | null;
      inviterName: string | null;
      expiresAt: string;
    }
  | {
      status: Exclude<LinkStatus, "valid">;
      kind: LinkKind;
      inviterName: string | null;
    };

export const acceptInviteInputSchema = z.object({
  token: linkTokenSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;

export const resetPasswordInputSchema = z.object({
  token: linkTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

/** Both passwords must match; checked in the browser only (the API gets one password). */
const confirmPasswordSchema = z.string().max(200).optional();
const passwordsMatch = { message: "mismatch", path: ["confirmPassword"] };

export const acceptInviteFormSchema = acceptInviteInputSchema
  .extend({ confirmPassword: confirmPasswordSchema })
  .refine((value) => value.password === value.confirmPassword, passwordsMatch);
export const resetPasswordFormSchema = resetPasswordInputSchema
  .extend({ confirmPassword: confirmPasswordSchema })
  .refine((value) => value.password === value.confirmPassword, passwordsMatch);

// ── Accounts list (owners and adults) ────────────────────────────────────────

export type AccountPerson = {
  habitantId: string;
  name: string;
  color: string;
  emoji: string | null;
};

export type AccountSummary = {
  id: string;
  email: string;
  role: Role;
  /** The habitant this login belongs to; `null` when the habitant was deleted. */
  person: AccountPerson | null;
  /** ISO timestamp, `null` when never logged in. */
  lastLoginAt: string | null;
  activeSessions: number;
  disabled: boolean;
  /** An open password-reset link expires at (ISO), or `null`. */
  resetLinkExpiresAt: string | null;
  createdAt: string;
};

export type PendingInvite = {
  id: string;
  person: AccountPerson;
  role: Role;
  createdByName: string | null;
  expiresAt: string;
  createdAt: string;
};

export type InvitableHabitant = AccountPerson & { type: (typeof ACCOUNT_HABITANT_TYPES)[number] };

export type AccountsOverview = {
  accounts: AccountSummary[];
  pendingInvites: PendingInvite[];
  /** Habitants without an account or open invite who could get one. */
  invitableHabitants: InvitableHabitant[];
  /** Owners whose account is not disabled (for the last-owner protection in the UI). */
  activeOwnerCount: number;
};

// ── My account (everyone) ────────────────────────────────────────────────────

export const changeEmailInputSchema = z.object({
  email: emailSchema,
  currentPassword: z.string().min(1).max(200),
});
export type ChangeEmailInput = z.infer<typeof changeEmailInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const changePasswordFormSchema = changePasswordInputSchema
  .extend({ confirmPassword: confirmPasswordSchema })
  .refine((value) => value.newPassword === value.confirmPassword, passwordsMatch);

export type DeviceSession = {
  /** Opaque, per response: only for React keys. Never the session token or its hash. */
  key: string;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
};

export type MyAccount = {
  email: string;
  sessions: DeviceSession[];
};
