import type { LoginInput, SetupInput, SetupStatus, UpdateAccountInput } from "@/features/auth/types/auth";
import { db } from "../lib/db";
import { HttpError, conflict, unauthorized } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/password";

// Verifying against a dummy hash keeps response time equal for unknown emails.
const DUMMY_HASH = await hashPassword("wickedhome-timing-equaliser");

export async function getSetupStatus(): Promise<SetupStatus> {
  const households = await db.household.count();
  return { needsSetup: households === 0 };
}

/** Creates the household, the owner habitant and the owner login. Only allowed once. */
export async function setupHousehold(input: SetupInput): Promise<{ userId: string }> {
  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    if ((await tx.household.count()) > 0) throw conflict("WickedHome is already set up");

    const household = await tx.household.create({ data: { name: input.householdName } });
    const habitant = await tx.habitant.create({
      data: { householdId: household.id, name: input.name, type: "ADULT", color: "#124734" },
    });
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: "OWNER",
        locale: input.locale,
        householdId: household.id,
        habitantId: habitant.id,
      },
    });
    return { userId: user.id };
  });
}

export async function authenticate(input: LoginInput): Promise<{ userId: string }> {
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized("Wrong email or password");
  // Only said after a correct password, so it reveals nothing to someone guessing.
  if (user.disabledAt) throw new HttpError(403, "account_disabled", "This account is disabled");

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { userId: user.id };
}

export async function updateAccount(userId: string, input: UpdateAccountInput): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { locale: input.locale } });
}
