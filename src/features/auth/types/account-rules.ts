import type { Role } from "./auth";

/**
 * Who may do what with household accounts. Pure functions: the API enforces them, the UI uses them to
 * only offer what will work. See docs/ACCOUNTS.md.
 *
 * - Owners invite any role; adults invite adults and children; children invite nobody.
 * - Only owners create owners, and adults can't change, disable, reset or remove an owner.
 * - There is always at least one active owner.
 */

/** Owners and adults see the Accounts section; children don't. */
export const canManageAccounts = (role: Role) => role === "owner" || role === "adult";

/** The roles `role` may hand out, in an invite or a role change. */
export function invitableRoles(role: Role): Role[] {
  if (role === "owner") return ["owner", "adult", "child"];
  if (role === "adult") return ["adult", "child"];
  return [];
}

/** Revoking (or renewing) an open invite needs the right to make it. */
export const canManageInvite = (actorRole: Role, inviteRole: Role) => invitableRoles(actorRole).includes(inviteRole);

export type AccountActor = { id: string; role: Role };
export type AccountTarget = { id: string; role: Role; disabled: boolean };

export type AccountAction =
  | { type: "changeRole"; role: Role }
  | { type: "disable" }
  | { type: "enable" }
  | { type: "signOut" }
  | { type: "resetLink" }
  | { type: "remove" };

/** Why an action is refused: not allowed for this actor, it would leave no owner, or it can't be done to yourself. */
export type AccountRuleError = "forbidden" | "last_owner" | "self";

/**
 * Returns why `actor` may not do `action` to `target`, or `null` when it is allowed. `activeOwnerCount` is
 * the number of owners whose account is not disabled, `target` included.
 */
export function accountActionError(
  actor: AccountActor,
  target: AccountTarget,
  action: AccountAction,
  activeOwnerCount: number,
): AccountRuleError | null {
  if (!canManageAccounts(actor.role)) return "forbidden";
  if (target.role === "owner" && actor.role !== "owner") return "forbidden";

  const self = actor.id === target.id;
  const isLastOwner = target.role === "owner" && !target.disabled && activeOwnerCount <= 1;

  switch (action.type) {
    case "changeRole":
      if (!invitableRoles(actor.role).includes(action.role)) return "forbidden";
      if (action.role !== "owner" && isLastOwner) return "last_owner";
      return null;
    case "disable":
      if (self) return "self";
      if (isLastOwner) return "last_owner";
      return null;
    case "remove":
      if (isLastOwner) return "last_owner";
      return null;
    case "resetLink":
      // Your own password is changed under My account, with the current password.
      return self ? "self" : null;
    case "enable":
    case "signOut":
      return null;
  }
}
