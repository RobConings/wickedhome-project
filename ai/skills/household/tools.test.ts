/**
 * The household skill: members for owners and adults, logins (invite, revoke, role, block) for owners only and
 * always confirmed, nothing that touches passwords, sessions or reset links, and an accounts list without e-mail
 * addresses. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/household/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AccountsOverview } from "@/features/auth/types/accounts";
import type { SessionUser } from "@/features/auth/types/auth";
import { getAssistantTool, listAssistantTools, toolInputJsonSchema, type AssistantToolContext } from "@ai/core/tools";
import "@ai/skills";
import { accountsSummary } from "./accounts";

const rules = (name: string) => {
  const tool = getAssistantTool(name);
  assert.ok(tool, `${name} is registered`);
  return [tool.permission, tool.confirm, [...tool.roles].sort().join(",")];
};

const owner: SessionUser = { id: "u1", email: "rob@example.com", name: "Rob", role: "owner", locale: "nl", householdId: "h1", householdName: "Thuis", habitantId: "h-rob" };

describe("household skill", () => {
  it("lets owners and adults change members, and only owners change logins (always confirmed)", () => {
    assert.deepEqual(rules("household.people"), ["read", "never", "adult,child,owner"]);
    assert.deepEqual(rules("household.save_member"), ["write", "always", "adult,owner"]);
    assert.deepEqual(rules("household.remove_member"), ["sensitive", "always", "adult,owner"]);
    assert.deepEqual(rules("household.accounts"), ["read", "never", "adult,owner"]);
    for (const name of ["household.invite", "household.revoke_invite", "household.set_account"]) assert.deepEqual(rules(name), ["sensitive", "always", "owner"], name);
  });

  it("has no tool for passwords, sessions, reset links, logging in as someone or removing the household", () => {
    const forbidden = /password|wachtwoord|session|reset|impersonat|login_as|delete_household|remove_household|token/i;
    for (const tool of listAssistantTools().filter((row) => ["household", "settings", "integrations", "automations", "app"].includes(row.skill))) {
      assert.doesNotMatch(tool.name, forbidden, tool.name);
      assert.doesNotMatch(JSON.stringify(Object.keys((toolInputJsonSchema(tool).properties ?? {}) as object)), forbidden, `${tool.name} arguments`);
    }
  });

  it("never hands out an invite link outside the app's chat", async () => {
    const invite = getAssistantTool("household.invite");
    const ctx: AssistantToolContext = { user: owner, householdId: "h1", locale: "nl", signal: new AbortController().signal, channel: "mcp" };
    await assert.rejects(async () => invite?.run(ctx, { role: "adult", newName: "Opa", newType: "adult" }), /only made in the app/);
  });

  it("lists accounts without e-mail addresses, sessions or reset links", () => {
    const overview: AccountsOverview = {
      accounts: [
        { id: "u1", email: "rob@example.com", role: "owner", person: { habitantId: "h-rob", name: "Rob", color: "#124734", emoji: null }, lastLoginAt: "2026-10-03T18:00:00.000Z", activeSessions: 3, disabled: false, resetLinkExpiresAt: "2026-10-05T10:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "u2", email: "lena@example.com", role: "child", person: { habitantId: "h-lena", name: "Lena", color: "#c2508a", emoji: null }, lastLoginAt: null, activeSessions: 0, disabled: true, resetLinkExpiresAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      pendingInvites: [{ id: "i1", person: { habitantId: "h-clara", name: "Clara", color: "#3b82b6", emoji: null }, role: "adult", createdByName: "someone@example.com", expiresAt: "2026-10-10T10:00:00.000Z", createdAt: "2026-10-03T10:00:00.000Z" }],
      invitableHabitants: [{ habitantId: "h-opa", name: "Opa", color: "#6b7280", emoji: null, type: "guest" }],
      activeOwnerCount: 1,
    };
    const result = accountsSummary(overview, { locale: "nl", user: owner });
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /@|session|reset/i);
    assert.equal(result.accounts[0]?.lastLogin, "03/10/2026");
    assert.equal(result.accounts[1]?.blocked, true);
    assert.equal(result.invites[0]?.expires, "10/10/2026");
    assert.deepEqual(result.canInvite, ["Opa (guest)"]);
  });
});
