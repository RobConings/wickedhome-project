import type {
  AcceptInviteInput,
  LinkKind,
  LinkPreview,
  ResetPasswordInput,
} from "@/features/auth/types/accounts";
import type { Role } from "@/features/auth/types/auth";
import { audit } from "../audit/audit.service";
import { db, type InviteKind } from "../lib/db";
import { HttpError, notFound } from "../lib/http";
import { hashPassword } from "../lib/password";
import { hashLinkToken, linkStatus } from "./link-token";
import { notifyInviteAccepted } from "./auth.notifications";

/**
 * Opening and using one-time links (public, no session). Unknown, malformed and wrong-kind tokens all get
 * the same 404; a known link that can't be used any more only says why and who made it. Tokens are never
 * logged. See docs/ACCOUNTS.md.
 */

export const toLinkKind = (kind: InviteKind): LinkKind => (kind === "INVITE" ? "invite" : "password_reset");
export const toRole = (role: string) => role.toLowerCase() as Role;

const linkNotFound = () => notFound("This link doesn't work");
const linkGone = (status: "expired" | "used" | "revoked") =>
  new HttpError(410, `link_${status}`, `This link was ${status === "expired" ? "valid until recently" : status}`);

const linkInclude = {
  household: { select: { name: true } },
  habitant: { select: { name: true, user: { select: { id: true } } } },
  user: { select: { email: true, disabledAt: true, role: true, habitant: { select: { name: true } } } },
  createdBy: { select: { habitant: { select: { name: true } } } },
} as const;

export async function lookupLink(token: string, now = new Date()): Promise<LinkPreview> {
  const link = await db.invite.findUnique({ where: { tokenHash: hashLinkToken(token) }, include: linkInclude });
  if (!link) throw linkNotFound();

  const kind = toLinkKind(link.kind);
  const inviterName = link.createdBy?.habitant?.name ?? null;
  let status = linkStatus(link, now);
  // An invite whose person got an account some other way, or a reset for a disabled account, is spent.
  if (status === "valid" && kind === "invite" && (!link.habitant || link.habitant.user)) status = "used";
  if (status === "valid" && kind === "password_reset" && (!link.user || link.user.disabledAt)) status = "revoked";
  if (status !== "valid") return { status, kind, inviterName };

  const name = kind === "invite" ? link.habitant?.name : (link.user?.habitant?.name ?? link.user?.email);
  const role = kind === "invite" ? link.role : link.user?.role;
  return {
    status,
    kind,
    householdName: link.household.name,
    name: name ?? "",
    role: toRole(role ?? "CHILD"),
    email: kind === "password_reset" ? (link.user?.email ?? null) : null,
    inviterName,
    expiresAt: link.expiresAt.toISOString(),
  };
}

/** Creates the account for an invite, linked to its habitant, and marks the invite used. */
export async function acceptInvite(input: AcceptInviteInput, now = new Date()): Promise<{ userId: string }> {
  // Hashing first keeps the response time the same for valid and invalid tokens.
  const passwordHash = await hashPassword(input.password);

  const accepted = await db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({
      where: { tokenHash: hashLinkToken(input.token) },
      include: { habitant: { select: { id: true, name: true, user: { select: { id: true } } } } },
    });
    if (!invite || invite.kind !== "INVITE" || !invite.role) throw linkNotFound();
    const status = linkStatus(invite, now);
    if (status !== "valid") throw linkGone(status);
    if (!invite.habitant || invite.habitant.user) throw linkGone("used");

    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new HttpError(409, "email_taken", "This email already has an account");
    }

    // Guards against the same link being used twice at the same moment.
    const { count } = await tx.invite.updateMany({
      where: { id: invite.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    if (count !== 1) throw linkGone("used");

    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: invite.role,
        locale: input.locale,
        householdId: invite.householdId,
        habitantId: invite.habitant.id,
        lastLoginAt: now,
      },
    });
    return {
      userId: user.id,
      householdId: invite.householdId,
      inviteId: invite.id,
      name: invite.habitant.name,
      role: toRole(invite.role),
      createdById: invite.createdById,
    };
  });
  await audit(
    { householdId: accepted.householdId, userId: accepted.userId, name: accepted.name, channel: "app" },
    { action: "invite.accepted", targetType: "invite", targetId: accepted.inviteId, targetLabel: accepted.name, summary: `Role: ${accepted.role}` },
  );
  notifyInviteAccepted(accepted);
  return { userId: accepted.userId };
}

/** Sets a new password from a reset link and signs the account out everywhere (the caller starts a new session). */
export async function resetPassword(input: ResetPasswordInput, now = new Date()): Promise<{ userId: string }> {
  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    const link = await tx.invite.findUnique({
      where: { tokenHash: hashLinkToken(input.token) },
      include: { user: { select: { id: true, disabledAt: true } } },
    });
    if (!link || link.kind !== "PASSWORD_RESET") throw linkNotFound();
    const status = linkStatus(link, now);
    if (status !== "valid") throw linkGone(status);
    if (!link.user || link.user.disabledAt) throw linkGone("revoked");

    const { count } = await tx.invite.updateMany({
      where: { id: link.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    if (count !== 1) throw linkGone("used");

    const userId = link.user.id;
    await tx.user.update({ where: { id: userId }, data: { passwordHash, lastLoginAt: now } });
    await tx.session.deleteMany({ where: { userId } });
    // Any other open reset link for this account is spent too.
    await tx.invite.updateMany({
      where: { userId, kind: "PASSWORD_RESET", usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return { userId };
  });
}
