import type { ChangeEmailInput, ChangePasswordInput, MyAccount } from "@/features/auth/types/accounts";
import { db } from "../lib/db";
import { HttpError } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/password";

/** Settings → My account: your email, password and devices. Everyone, children included. */

const wrongPassword = () =>
  new HttpError(400, "wrong_password", "Current password is wrong", { currentPassword: ["Wrong password"] });

async function assertPassword(userId: string, password: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(password, user.passwordHash))) throw wrongPassword();
}

export async function getMyAccount(userId: string, currentSessionId: string | undefined, now = new Date()): Promise<MyAccount> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      sessions: { where: { expiresAt: { gt: now } }, orderBy: { lastSeenAt: "desc" } },
    },
  });
  return {
    email: user.email,
    sessions: user.sessions.map((session, index) => ({
      key: String(index),
      userAgent: session.userAgent,
      lastSeenAt: session.lastSeenAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      current: session.id === currentSessionId,
    })),
  };
}

export async function changeEmail(userId: string, input: ChangeEmailInput): Promise<void> {
  await assertPassword(userId, input.currentPassword);
  const taken = await db.user.findFirst({ where: { email: input.email, id: { not: userId } }, select: { id: true } });
  if (taken) throw new HttpError(409, "email_taken", "This email already has an account");
  await db.user.update({ where: { id: userId }, data: { email: input.email } });
}

/** Changes the password and signs out every other session (this one stays). */
export async function changePassword(userId: string, input: ChangePasswordInput, keepSessionId: string | undefined): Promise<void> {
  await assertPassword(userId, input.currentPassword);
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) } }),
    db.invite.updateMany({
      where: { userId, kind: "PASSWORD_RESET", usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
