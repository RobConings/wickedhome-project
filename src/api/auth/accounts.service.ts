import {
  accountActionError,
  canManageInvite,
  invitableRoles,
  type AccountAction,
  type AccountRuleError,
} from "@/features/auth/types/account-rules";
import {
  ACCOUNT_HABITANT_TYPES,
  type AccountPerson,
  type AccountSummary,
  type AccountsOverview,
  type CreatedInvite,
  type CreatedLink,
  type CreateInviteInput,
  type InvitableHabitant,
  type PendingInvite,
} from "@/features/auth/types/accounts";
import type { Role, SessionUser } from "@/features/auth/types/auth";
import { appActor, audit, type AuditRecord } from "../audit/audit.service";
import { db, type HabitantType, type Prisma, type Role as RoleRow } from "../lib/db";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/http";
import { createLinkToken, linkExpiry } from "./link-token";
import { toRole } from "./links.service";

/**
 * Accounts of the household (Settings → Accounts, owners and adults): invites, role changes, disabling,
 * signing out, password-reset links and removal. Every rule lives in account-rules.ts; this file applies
 * it to the database. See docs/ACCOUNTS.md.
 */

const fromRole = (role: Role) => role.toUpperCase() as RoleRow;

const openLink = (now: Date) => ({ usedAt: null, revokedAt: null, expiresAt: { gt: now } });

const ruleMessages: Record<AccountRuleError, () => HttpError> = {
  forbidden: () => forbidden("You can't do that with this account"),
  last_owner: () => new HttpError(409, "last_owner", "The household needs at least one owner"),
  self: () => new HttpError(409, "self", "You can't do that with your own account"),
};

const toPerson = (habitant: { id: string; name: string; color: string; emoji: string | null }): AccountPerson => ({
  habitantId: habitant.id,
  name: habitant.name,
  color: habitant.color,
  emoji: habitant.emoji,
});

const personSelect = { id: true, name: true, color: true, emoji: true } as const;

const inviteInclude = {
  habitant: { select: personSelect },
  createdBy: { select: { email: true, habitant: { select: { name: true } } } },
} as const;

type InviteRow = Prisma.InviteGetPayload<{ include: typeof inviteInclude }>;

function toPendingInvite(row: InviteRow): PendingInvite {
  return {
    id: row.id,
    person: row.habitant ? toPerson(row.habitant) : { habitantId: "", name: "?", color: "#6b7280", emoji: null },
    role: toRole(row.role ?? "CHILD"),
    createdByName: row.createdBy ? (row.createdBy.habitant?.name ?? row.createdBy.email) : null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const countActiveOwners = (householdId: string, tx: Prisma.TransactionClient = db) =>
  tx.user.count({ where: { householdId, role: "OWNER", disabledAt: null } });

export async function getAccountsOverview(householdId: string, now = new Date()): Promise<AccountsOverview> {
  const [users, invites, habitants, activeOwnerCount] = await Promise.all([
    db.user.findMany({
      where: { householdId },
      orderBy: { createdAt: "asc" },
      include: {
        habitant: { select: personSelect },
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
        passwordResets: { where: openLink(now), select: { expiresAt: true }, orderBy: { expiresAt: "desc" }, take: 1 },
      },
    }),
    db.invite.findMany({
      where: { householdId, kind: "INVITE", ...openLink(now) },
      orderBy: { createdAt: "desc" },
      include: inviteInclude,
    }),
    db.habitant.findMany({
      where: {
        householdId,
        user: null,
        type: { in: ACCOUNT_HABITANT_TYPES.map((type) => type.toUpperCase() as HabitantType) },
      },
      orderBy: { name: "asc" },
      select: { ...personSelect, type: true },
    }),
    countActiveOwners(householdId),
  ]);

  const invitedHabitantIds = new Set(invites.map((invite) => invite.habitantId));
  const accounts: AccountSummary[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    role: toRole(user.role),
    person: user.habitant ? toPerson(user.habitant) : null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    activeSessions: user._count.sessions,
    disabled: user.disabledAt !== null,
    resetLinkExpiresAt: user.passwordResets[0]?.expiresAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }));
  const invitableHabitants: InvitableHabitant[] = habitants
    .filter((habitant) => !invitedHabitantIds.has(habitant.id))
    .map((habitant) => ({ ...toPerson(habitant), type: habitant.type.toLowerCase() as InvitableHabitant["type"] }));

  return { accounts, pendingInvites: invites.filter((invite) => invite.habitant).map(toPendingInvite), invitableHabitants, activeOwnerCount };
}

/**
 * Makes an invite link for an existing habitant without an account, or for a new habitant created on the
 * spot. An open invite for the same habitant is revoked: there is one open invite per person.
 */
export async function createInvite(actor: SessionUser, input: CreateInviteInput, now = new Date()): Promise<CreatedInvite> {
  if (!invitableRoles(actor.role).includes(input.role)) throw ruleMessages.forbidden();
  const { token, tokenHash } = createLinkToken();

  const invite = await db.$transaction(async (tx) => {
    let habitantId: string;
    if (input.habitantId) {
      const habitant = await tx.habitant.findFirst({
        where: { id: input.habitantId, householdId: actor.householdId },
        select: { id: true, type: true, user: { select: { id: true } } },
      });
      if (!habitant) throw notFound("No such habitant");
      if (habitant.user) throw new HttpError(409, "has_account", "This person already has an account");
      if (habitant.type === "PET") throw badRequest("Pets can't get an account", { habitantId: ["Pets can't log in"] });
      habitantId = habitant.id;
    } else if (input.newHabitant) {
      const created = await tx.habitant.create({
        data: {
          householdId: actor.householdId,
          name: input.newHabitant.name,
          type: input.newHabitant.type.toUpperCase() as HabitantType,
          color: input.newHabitant.color.toLowerCase(),
        },
      });
      habitantId = created.id;
    } else {
      throw badRequest("Pick a person or add a new one");
    }

    const open = await tx.invite.findMany({
      where: { habitantId, kind: "INVITE", usedAt: null, revokedAt: null },
      select: { role: true },
    });
    if (open.some((existing) => existing.role && !canManageInvite(actor.role, toRole(existing.role)))) {
      // An adult can't replace an owner invite made by an owner.
      throw ruleMessages.forbidden();
    }
    await tx.invite.updateMany({
      where: { habitantId, kind: "INVITE", usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });

    return tx.invite.create({
      data: {
        kind: "INVITE",
        tokenHash,
        householdId: actor.householdId,
        habitantId,
        role: fromRole(input.role),
        createdById: actor.id,
        expiresAt: linkExpiry("invite", now),
      },
      include: inviteInclude,
    });
  });

  const pending = toPendingInvite(invite);
  // Never the token: only who was invited and as what.
  await audit(appActor(actor), { action: "invite.created", targetType: "invite", targetId: invite.id, targetLabel: pending.person.name, summary: `Role: ${pending.role}` });
  return { kind: "invite", token, expiresAt: invite.expiresAt.toISOString(), invite: pending };
}

export async function revokeInvite(actor: SessionUser, inviteId: string, now = new Date()): Promise<void> {
  const invite = await db.invite.findFirst({
    where: { id: inviteId, householdId: actor.householdId, kind: "INVITE" },
    select: { id: true, role: true, habitant: { select: { name: true } } },
  });
  if (!invite) throw notFound("No such invite");
  if (invite.role && !canManageInvite(actor.role, toRole(invite.role))) throw ruleMessages.forbidden();
  const { count } = await db.invite.updateMany({ where: { id: invite.id, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
  if (count > 0) {
    await audit(appActor(actor), { action: "invite.revoked", targetType: "invite", targetId: invite.id, targetLabel: invite.habitant?.name ?? null });
  }
}

type Target = { id: string; role: RoleRow; label: string };

/**
 * Loads the target account in the actor's household and checks the rule inside the same transaction as
 * the change, so two owners demoting each other at once can't leave the household without one. After the
 * change is committed, `record` describes it for the audit log.
 */
async function withTarget<T>(
  actor: SessionUser,
  userId: string,
  action: AccountAction,
  change: (tx: Prisma.TransactionClient, target: Target) => Promise<T>,
  record: (target: Target, result: T) => AuditRecord,
): Promise<T> {
  const seen: { target?: Target } = {};
  const result = await db.$transaction(
    async (tx) => {
      const row = await tx.user.findFirst({
        where: { id: userId, householdId: actor.householdId },
        select: { id: true, role: true, disabledAt: true, email: true, habitant: { select: { name: true } } },
      });
      if (!row) throw notFound("No such account");
      const error = accountActionError(
        actor,
        { id: row.id, role: toRole(row.role), disabled: row.disabledAt !== null },
        action,
        await countActiveOwners(actor.householdId, tx),
      );
      if (error) throw ruleMessages[error]();
      seen.target = { id: row.id, role: row.role, label: row.habitant?.name ?? row.email };
      return change(tx, seen.target);
    },
    { isolationLevel: "Serializable" },
  );
  if (seen.target) await audit(appActor(actor), { targetType: "account", targetId: seen.target.id, targetLabel: seen.target.label, ...record(seen.target, result) });
  return result;
}

export async function changeRole(actor: SessionUser, userId: string, role: Role): Promise<void> {
  await withTarget(
    actor,
    userId,
    { type: "changeRole", role },
    (tx, target) => tx.user.update({ where: { id: target.id }, data: { role: fromRole(role) } }),
    (target) => ({ action: "account.role_changed", summary: `Role: ${toRole(target.role)} → ${role}` }),
  );
}

/** Disabling blocks login, ends every session and spends open reset links. */
export async function setDisabled(actor: SessionUser, userId: string, disabled: boolean, now = new Date()): Promise<void> {
  const record = () => ({ action: disabled ? "account.disabled" : "account.enabled" });
  await withTarget(actor, userId, { type: disabled ? "disable" : "enable" }, async (tx, target) => {
    await tx.user.update({ where: { id: target.id }, data: { disabledAt: disabled ? now : null } });
    if (!disabled) return;
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.invite.updateMany({
      where: { userId: target.id, kind: "PASSWORD_RESET", usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  }, record);
}

export async function signOutEverywhere(actor: SessionUser, userId: string): Promise<number> {
  return withTarget(
    actor,
    userId,
    { type: "signOut" },
    async (tx, target) => {
      const { count } = await tx.session.deleteMany({ where: { userId: target.id } });
      return count;
    },
    (_target, count) => ({ action: "account.signed_out", summary: `${count} sessions ended` }),
  );
}

/** A 24-hour link to set a new password. Replaces an open one for the same account. */
export async function createResetLink(actor: SessionUser, userId: string, now = new Date()): Promise<CreatedLink> {
  const { token, tokenHash } = createLinkToken();
  const link = await withTarget(actor, userId, { type: "resetLink" }, async (tx, target) => {
    const account = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: { disabledAt: true } });
    if (account.disabledAt) throw conflict("Enable this account first");
    await tx.invite.updateMany({
      where: { userId: target.id, kind: "PASSWORD_RESET", usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.invite.create({
      data: {
        kind: "PASSWORD_RESET",
        tokenHash,
        householdId: actor.householdId,
        userId: target.id,
        createdById: actor.id,
        expiresAt: linkExpiry("password_reset", now),
      },
    });
  }, () => ({ action: "account.reset_link" }));
  return { kind: "password_reset", token, expiresAt: link.expiresAt.toISOString() };
}

/** Removes the login only: the habitant and everything they did stay. */
export async function removeAccount(actor: SessionUser, userId: string): Promise<void> {
  await withTarget(
    actor,
    userId,
    { type: "remove" },
    (tx, target) => tx.user.delete({ where: { id: target.id } }),
    () => ({ action: "account.removed" }),
  );
}
