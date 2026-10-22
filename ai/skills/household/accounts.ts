import { z } from "zod";
import { changeRole, createInvite, getAccountsOverview, revokeInvite, setDisabled } from "@/api/auth/accounts.service";
import { config } from "@/api/lib/config";
import { ACCOUNT_HABITANT_TYPES, linkPath, type AccountsOverview } from "@/features/auth/types/accounts";
import { ROLES } from "@/features/auth/types/auth";
import { HABITANT_COLORS } from "@/features/household/types/household";
import { badRequest } from "@/api/lib/http";
import { day, done, entityRef, registerAssistantTool, say, type AssistantToolContext } from "@ai/core/kit";

/**
 * Household logins (Settings › Accounts), part of the "household" skill. The list is for owners and adults (as
 * in the app); inviting, revoking invites and changing a login's role or access are owners only here (stricter
 * than the app, where adults may do some of it) and always confirmed. The services apply every account rule
 * (last owner, yourself, who may hand out which role) and audit the change.
 *
 * Never exposed: passwords, sessions, password-reset links, e-mail addresses, removing a login, signing someone
 * out. An invite link (single use, expires) is returned only in the app's chat, never over MCP.
 */

const MANAGERS = ["owner", "adult"] as const;
const OWNERS = ["owner"] as const;

/** The app's public address, the origin Google sends people back to (GOOGLE_REDIRECT_URI, the app's own URL). */
const appOrigin = () => new URL(config.GOOGLE_REDIRECT_URI).origin;

const accountOf = (overview: AccountsOverview, habitantId: string) => overview.accounts.find((account) => account.person?.habitantId === habitantId) ?? null;

async function accountFor(ctx: AssistantToolContext, person: { id: string; name: string }) {
  const overview = await getAccountsOverview(ctx.householdId);
  const account = accountOf(overview, person.id);
  if (!account) throw badRequest(`${person.name} has no login. Invite them with household_invite.`);
  return { overview, account };
}

registerAssistantTool({
  name: "household.accounts",
  description: "Who has a login, with role, last login and whether it is blocked; open invites; who could still be invited.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  roles: MANAGERS,
  activity: { en: "Checked the accounts", nl: "Accounts bekeken" },
  run: async (ctx) => accountsSummary(await getAccountsOverview(ctx.householdId), ctx),
});

/** The Accounts list for the model: no e-mail addresses, sessions or reset links, only what a follow-up needs. */
export function accountsSummary(overview: AccountsOverview, ctx: Pick<AssistantToolContext, "locale" | "user">) {
  return {
    accounts: overview.accounts.map((account) => ({
      name: account.person?.name ?? "(removed person)",
      role: account.role,
      blocked: account.disabled || null,
      lastLogin: account.lastLoginAt ? day(account.lastLoginAt, ctx.locale) : "never",
      you: account.id === ctx.user.id || null,
    })),
    invites: overview.pendingInvites.map((invite) => ({
      name: invite.person.name,
      role: invite.role,
      expires: day(invite.expiresAt, ctx.locale),
      // The app falls back to the inviter's e-mail address when they have no habitant: never repeated here.
      by: invite.createdByName?.includes("@") ? null : invite.createdByName,
    })),
    canInvite: overview.invitableHabitants.map((habitant) => `${habitant.name} (${habitant.type})`),
  };
}

registerAssistantTool({
  name: "household.invite",
  description:
    "Make an invite link so a person gets a login with a role: an existing member without a login, or a new person (newName + newType). Returns the link to share; the app also shows it as a QR code in Settings › Accounts.",
  input: z.object({
    person: entityRef("habitant", "Existing member without a login (first name)").optional(),
    newName: z.string().trim().min(1).max(60).optional().describe("Name of a new person (when not a member yet)"),
    newType: z.enum(ACCOUNT_HABITANT_TYPES).optional().describe("Type of the new person"),
    role: z.enum(ROLES).describe("owner, adult or child"),
  }),
  permission: "sensitive",
  confirm: "always",
  roles: OWNERS,
  activity: { en: "Made an invite link", nl: "Uitnodigingslink gemaakt" },
  describe: (ctx, input) => {
    const who = input.person?.name ?? input.newName ?? "?";
    return say(ctx.locale, `Make an invite link for ${who} as ${input.role}`, `Uitnodigingslink maken voor ${who} als ${input.role}`);
  },
  preview: (ctx, input) => ({
    kind: "fields",
    data: {
      fields: [
        { label: say(ctx.locale, "Person", "Persoon"), value: input.person?.name ?? `${input.newName ?? "?"} (${say(ctx.locale, "new", "nieuw")})` },
        { label: say(ctx.locale, "Role", "Rol"), value: input.role },
        { label: say(ctx.locale, "Link", "Link"), value: say(ctx.locale, "works once, expires after a few days", "werkt één keer, vervalt na enkele dagen") },
      ],
    },
  }),
  run: async (ctx, input) => {
    // The token only exists in this answer: an outside MCP client never gets it.
    if (ctx.channel !== "chat") throw badRequest("Invite links are only made in the app (chat or Settings › Accounts).");
    if (!input.person && !(input.newName && input.newType)) throw badRequest("Name an existing member, or give newName and newType for a new person.");
    const created = await createInvite(
      ctx.user,
      input.person
        ? { habitantId: input.person.id, role: input.role }
        : { newHabitant: { name: input.newName ?? "", type: input.newType ?? "adult", color: HABITANT_COLORS[0] }, role: input.role },
    );
    const link = `${appOrigin()}${linkPath("invite", created.token)}`;
    return done(`Invite for ${created.invite.person.name} as ${created.invite.role}, valid until ${day(created.expiresAt)}. Share this link privately (it works once): ${link}`, {
      link,
      note: "Give the link exactly as is. Settings › Accounts shows it as a QR code too.",
    });
  },
});

registerAssistantTool({
  name: "household.revoke_invite",
  description: "Cancel a person's open invite link, so it no longer works.",
  input: z.object({ person: entityRef("habitant") }),
  permission: "sensitive",
  confirm: "always",
  roles: OWNERS,
  activity: { en: "Cancelled an invite", nl: "Uitnodiging ingetrokken" },
  describe: (ctx, input) => say(ctx.locale, `Cancel the invite link of ${input.person.name}`, `Uitnodigingslink van ${input.person.name} intrekken`),
  run: async (ctx, input) => {
    const invite = (await getAccountsOverview(ctx.householdId)).pendingInvites.find((row) => row.person.habitantId === input.person.id);
    if (!invite) return { error: `${input.person.name} has no open invite.` };
    await revokeInvite(ctx.user, invite.id);
    return done(`The invite link of ${input.person.name} no longer works.`);
  },
});

const ACCESS = ["allowed", "blocked"] as const;

registerAssistantTool({
  name: "household.set_account",
  description: "Change the role of a person's login (owner, adult, child) and/or block or allow their login. Blocking signs them out everywhere.",
  input: z.object({
    person: entityRef("habitant"),
    role: z.enum(ROLES).optional(),
    access: z.enum(ACCESS).optional().describe("blocked: can't log in; allowed: can log in again"),
  }),
  permission: "sensitive",
  confirm: "always",
  roles: OWNERS,
  activity: { en: "Changed a login", nl: "Login aangepast" },
  describe: (ctx, input) => {
    const parts = [input.role && say(ctx.locale, `role ${input.role}`, `rol ${input.role}`), input.access && say(ctx.locale, input.access === "blocked" ? "block the login" : "allow the login", input.access === "blocked" ? "login blokkeren" : "login toestaan")].filter(Boolean);
    return say(ctx.locale, `${input.person.name}: ${parts.join(", ")}`, `${input.person.name}: ${parts.join(", ")}`);
  },
  preview: async (ctx, input) => {
    const { account } = await accountFor(ctx, input.person);
    const access = (blocked: boolean) => say(ctx.locale, blocked ? "blocked" : "allowed", blocked ? "geblokkeerd" : "toegestaan");
    const fields = [
      input.role && input.role !== account.role ? { label: say(ctx.locale, "Role", "Rol"), value: `${account.role} → ${input.role}` } : null,
      input.access && (input.access === "blocked") !== account.disabled ? { label: say(ctx.locale, "Login", "Login"), value: `${access(account.disabled)} → ${access(input.access === "blocked")}` } : null,
    ].filter((field) => field !== null);
    return { kind: "fields", title: input.person.name, data: { fields: fields.length ? fields : [{ label: say(ctx.locale, "Change", "Wijziging"), value: say(ctx.locale, "nothing changes", "er verandert niets") }] } };
  },
  run: async (ctx, input) => {
    if (!input.role && !input.access) throw badRequest("Say which role, or whether the login is blocked or allowed.");
    const { account } = await accountFor(ctx, input.person);
    const changes: string[] = [];
    if (input.role && input.role !== account.role) {
      await changeRole(ctx.user, account.id, input.role);
      changes.push(`role ${account.role} → ${input.role}`);
    }
    if (input.access && (input.access === "blocked") !== account.disabled) {
      await setDisabled(ctx.user, account.id, input.access === "blocked");
      changes.push(input.access === "blocked" ? "login blocked (signed out everywhere)" : "login allowed again");
    }
    return done(changes.length ? `${input.person.name}: ${changes.join(", ")}.` : `${input.person.name}: nothing to change.`);
  },
});
