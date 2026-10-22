/**
 * Unit tests for the account rules (who may invite, change, disable, remove) and the link forms' validation.
 * Pure; no database. Run on the server:
 *
 *   npx tsx --test src/features/auth/types/account-rules.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountActionError, canManageAccounts, canManageInvite, invitableRoles, type AccountTarget } from "./account-rules";
import {
  acceptInviteFormSchema,
  acceptInviteInputSchema,
  changePasswordFormSchema,
  createInviteInputSchema,
  resetPasswordFormSchema,
} from "./accounts";

const owner = { id: "owner", role: "owner" as const };
const adult = { id: "adult", role: "adult" as const };
const child = { id: "child", role: "child" as const };
const target = (id: string, role: AccountTarget["role"], disabled = false): AccountTarget => ({ id, role, disabled });

describe("invitableRoles", () => {
  it("lets owners invite anyone, adults adults and children, children nobody", () => {
    assert.deepEqual(invitableRoles("owner"), ["owner", "adult", "child"]);
    assert.deepEqual(invitableRoles("adult"), ["adult", "child"]);
    assert.deepEqual(invitableRoles("child"), []);
  });

  it("only shows the Accounts section to owners and adults", () => {
    assert.equal(canManageAccounts("owner"), true);
    assert.equal(canManageAccounts("adult"), true);
    assert.equal(canManageAccounts("child"), false);
  });

  it("lets adults revoke adult and child invites, not owner invites", () => {
    assert.equal(canManageInvite("adult", "child"), true);
    assert.equal(canManageInvite("adult", "owner"), false);
    assert.equal(canManageInvite("owner", "owner"), true);
  });
});

describe("accountActionError", () => {
  it("refuses everything to children", () => {
    assert.equal(accountActionError(child, target("x", "child"), { type: "signOut" }, 1), "forbidden");
  });

  it("only lets owners make owners", () => {
    assert.equal(accountActionError(adult, target("x", "adult"), { type: "changeRole", role: "owner" }, 1), "forbidden");
    assert.equal(accountActionError(owner, target("x", "adult"), { type: "changeRole", role: "owner" }, 1), null);
    assert.equal(accountActionError(adult, target("x", "adult"), { type: "changeRole", role: "child" }, 1), null);
  });

  it("keeps adults away from owners", () => {
    for (const action of [
      { type: "changeRole", role: "adult" },
      { type: "disable" },
      { type: "signOut" },
      { type: "resetLink" },
      { type: "remove" },
    ] as const) {
      assert.equal(accountActionError(adult, target("o2", "owner"), action, 2), "forbidden", action.type);
    }
  });

  it("never leaves the household without an active owner", () => {
    assert.equal(accountActionError(owner, target("owner", "owner"), { type: "changeRole", role: "adult" }, 1), "last_owner");
    assert.equal(accountActionError(owner, target("owner", "owner"), { type: "remove" }, 1), "last_owner");
    // With a second owner both are fine.
    assert.equal(accountActionError(owner, target("owner", "owner"), { type: "changeRole", role: "adult" }, 2), null);
    assert.equal(accountActionError(owner, target("o2", "owner"), { type: "remove" }, 2), null);
    assert.equal(accountActionError(owner, target("o2", "owner"), { type: "disable" }, 2), null);
    // A disabled owner doesn't count, so removing or demoting it is fine.
    assert.equal(accountActionError(owner, target("o2", "owner", true), { type: "remove" }, 1), null);
  });

  it("lets you remove yourself, but not when you're the last owner", () => {
    assert.equal(accountActionError(owner, target("owner", "owner"), { type: "remove" }, 1), "last_owner");
    assert.equal(accountActionError(adult, target("adult", "adult"), { type: "remove" }, 1), null);
  });

  it("doesn't let you disable yourself or make yourself a reset link", () => {
    assert.equal(accountActionError(owner, target("owner", "owner"), { type: "disable" }, 2), "self");
    assert.equal(accountActionError(adult, target("adult", "adult"), { type: "resetLink" }, 1), "self");
    assert.equal(accountActionError(adult, target("x", "child"), { type: "resetLink" }, 1), null);
  });
});

describe("link forms", () => {
  const token = "a".repeat(43);
  const valid = { token, email: "Clara@Example.com", password: "correct horse", confirmPassword: "correct horse", locale: "nl" };

  it("accepts a complete invite form and lower-cases the email", () => {
    const result = acceptInviteFormSchema.safeParse(valid);
    assert.ok(result.success);
    assert.equal(result.data.email, "clara@example.com");
  });

  it("requires the setup password policy (at least 10 characters)", () => {
    assert.equal(acceptInviteInputSchema.safeParse({ ...valid, password: "short" }).success, false);
    assert.equal(resetPasswordFormSchema.safeParse({ token, password: "123456789", confirmPassword: "123456789" }).success, false);
  });

  it("flags a confirmation that doesn't match on the confirmation field", () => {
    const result = acceptInviteFormSchema.safeParse({ ...valid, confirmPassword: "something else" });
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues.map((issue) => issue.path.join(".")), ["confirmPassword"]);
    assert.equal(changePasswordFormSchema.safeParse({ currentPassword: "x", newPassword: "long enough!", confirmPassword: "nope" }).success, false);
  });

  it("rejects a bad email, token or language", () => {
    assert.equal(acceptInviteInputSchema.safeParse({ ...valid, email: "not-an-email" }).success, false);
    assert.equal(acceptInviteInputSchema.safeParse({ ...valid, token: "short" }).success, false);
    assert.equal(acceptInviteInputSchema.safeParse({ ...valid, locale: "fr" }).success, false);
  });

  it("needs exactly one of an existing habitant or a new one to invite", () => {
    const newHabitant = { name: "Clara", type: "adult", color: "#3b82b6" };
    assert.ok(createInviteInputSchema.safeParse({ habitantId: "h2", role: "adult" }).success);
    assert.ok(createInviteInputSchema.safeParse({ newHabitant, role: "adult" }).success);
    assert.equal(createInviteInputSchema.safeParse({ role: "adult" }).success, false);
    assert.equal(createInviteInputSchema.safeParse({ habitantId: "h2", newHabitant, role: "adult" }).success, false);
    assert.equal(createInviteInputSchema.safeParse({ newHabitant: { ...newHabitant, type: "pet" }, role: "child" }).success, false);
  });
});
