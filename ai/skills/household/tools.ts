import { z } from "zod";
import { createHabitant, deleteHabitant, getHouseholdOverview, updateHabitant } from "@/api/household/household.service";
import { HABITANT_COLORS, HABITANT_TYPES, type Habitant } from "@/features/household/types/household";
import { daysBetween, todayIn } from "@/types/dates";
import {
  day,
  done,
  entityRef,
  optionalDateSchema,
  registerAssistantContext,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  say,
  type AssistantToolContext,
} from "@ai/core/kit";
import "./accounts";

/**
 * Skill "household": the people of the house and their logins. Registers the `habitant` resolver (names,
 * nicknames, "ik/me" → the person asking), the "People:" snapshot line, the members' tools (here) and the
 * accounts' tools (accounts.ts: logins, roles, invites). Habitants are household members, pets and guests;
 * only some have a login account (and a role).
 */

registerAssistantSkill({
  id: "household",
  title: { en: "Household members and accounts", nl: "Gezinsleden en accounts" },
  summary: "The people (and pets) of the house: names, types, birthdays; logins, roles and invites.",
  keywords: {
    nl: ["gezin", "gezinslid", "huisgenoot", "bewoner", "verjaardag", "jarig", "huisdier", "woont", "hoe oud", "leeftijd", "uitnodigen", "uitnodiging", "account", "login", "inloggen", "rol", "eigenaar", "wachtwoord", "toegang"],
    en: ["household member", "family", "habitant", "birthday", "pet", "lives", "live here", "how old", "age", "invite", "invitation", "account", "login", "log in", "role", "owner", "password", "access"],
  },
});

const ageOn = (birthday: string, today: string) => Math.floor(daysBetween(birthday, today) / 365.25);

registerEntityResolver({
  type: "habitant",
  label: "person",
  skill: "household",
  list: async (ctx) => {
    const { habitants } = await getHouseholdOverview(ctx.householdId);
    const firstNames = habitants.map((habitant) => habitant.name.split(/\s+/)[0]?.toLowerCase());
    return habitants.map((habitant) => {
      const first = habitant.name.split(/\s+/)[0] ?? habitant.name;
      // The first name is an alias when no one else shares it.
      const unique = firstNames.filter((name) => name === first.toLowerCase()).length === 1;
      return {
        id: habitant.id,
        name: habitant.name,
        aliases: unique && first !== habitant.name ? [first] : [],
        hint: habitant.type,
        self: habitant.id === ctx.user.habitantId,
      };
    });
  },
});

registerAssistantContext({
  id: "people",
  order: 10,
  build: async (ctx) => {
    const { habitants } = await getHouseholdOverview(ctx.householdId);
    if (!habitants.length) return null;
    const today = todayIn();
    const people = habitants.map((habitant) => {
      const notes: string[] = [habitant.type];
      if (habitant.id === ctx.user.habitantId) notes.push("you");
      if (habitant.type === "child" && habitant.birthday) notes.push(`${ageOn(habitant.birthday, today)} y`);
      return `${habitant.name} (${notes.join(", ")})`;
    });
    return `People: ${people.join(", ")}.`;
  },
});

registerAssistantTool({
  name: "household.people",
  description: "The household members with type (adult, child, pet, guest), birthday and whether they have an app account.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the household members", nl: "Gezinsleden bekeken" },
  run: async (ctx) => {
    const { habitants } = await getHouseholdOverview(ctx.householdId);
    const today = todayIn();
    return {
      people: habitants.map((habitant) => ({
        name: habitant.name,
        type: habitant.type,
        birthday: habitant.birthday,
        birthdayText: day(habitant.birthday, ctx.locale),
        age: habitant.birthday ? ageOn(habitant.birthday, today) : null,
        account: habitant.hasAccount,
        you: habitant.id === ctx.user.habitantId || null,
      })),
    };
  },
});

// ── Changing members (Habitants page: owners and adults) ───────────────────────────────────────────────

const memberType = z.enum(HABITANT_TYPES);

async function findHabitant(ctx: AssistantToolContext, id: string): Promise<Habitant> {
  const habitant = (await getHouseholdOverview(ctx.householdId)).habitants.find((row) => row.id === id);
  if (!habitant) throw new Error("This person is no longer in the household");
  return habitant;
}

/** A colour no one has yet (the form's palette), else the first one. */
async function freeColor(ctx: AssistantToolContext): Promise<string> {
  const taken = new Set((await getHouseholdOverview(ctx.householdId)).habitants.map((habitant) => habitant.color.toLowerCase()));
  return HABITANT_COLORS.find((color) => !taken.has(color)) ?? HABITANT_COLORS[0];
}

const saveMemberInput = z.object({
  person: entityRef("habitant", "Existing member to change (first name); leave out to add someone new").optional(),
  name: z.string().trim().min(1).max(60).optional().describe("Name of a new member, or the new name"),
  type: memberType.optional().describe("adult, child, pet or guest (required for a new member)"),
  birthday: optionalDateSchema("Birthday YYYY-MM-DD"),
  emoji: z.string().trim().max(8).optional(),
});

registerAssistantTool({
  name: "household.save_member",
  description: "Add a household member (adult, child, pet, guest), or change a member's name, type, birthday or emoji. This adds no login: for that use household_invite.",
  input: saveMemberInput,
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a household member", nl: "Gezinslid bewaard" },
  describe: (ctx, input) => {
    if (input.person) return say(ctx.locale, `Change ${input.person.name}`, `${input.person.name} aanpassen`);
    return say(ctx.locale, `Add ${input.name ?? "?"} (${input.type ?? "?"}) to the household`, `${input.name ?? "?"} (${input.type ?? "?"}) toevoegen aan het gezin`);
  },
  preview: async (ctx, input) => {
    const current = input.person ? await findHabitant(ctx, input.person.id) : null;
    const row = (label: [string, string], before: string | null | undefined, after: string | null | undefined) =>
      after === undefined || after === before ? null : { label: say(ctx.locale, ...label), value: before ? `${before} → ${after ?? "–"}` : (after ?? "–") };
    const fields = [
      row(["Name", "Naam"], current?.name, input.name),
      row(["Type", "Type"], current?.type, input.type),
      row(["Birthday", "Verjaardag"], day(current?.birthday, ctx.locale), input.birthday ? day(input.birthday, ctx.locale) : undefined),
      row(["Emoji", "Emoji"], current?.emoji, input.emoji),
    ].filter((field) => field !== null);
    return fields.length ? { kind: "fields", title: current?.name ?? input.name, data: { fields } } : null;
  },
  run: async (ctx, input) => {
    if (input.person) {
      const current = await findHabitant(ctx, input.person.id);
      const saved = await updateHabitant(ctx.householdId, current.id, {
        name: input.name ?? current.name,
        type: input.type ?? current.type,
        color: current.color,
        emoji: input.emoji ?? current.emoji,
        birthday: input.birthday ?? current.birthday,
      });
      return done(`Saved ${saved.name} (${saved.type}${saved.birthday ? `, born ${day(saved.birthday)}` : ""}).`);
    }
    if (!input.name || !input.type) return { error: "A new member needs a name and a type (adult, child, pet or guest)." };
    const saved = await createHabitant(ctx.householdId, {
      name: input.name,
      type: input.type,
      color: await freeColor(ctx),
      emoji: input.emoji ?? null,
      birthday: input.birthday ?? null,
    });
    return done(`Added ${saved.name} (${saved.type}) to the household.`, { id: saved.id });
  },
});

registerAssistantTool({
  name: "household.remove_member",
  description: "Remove a household member (and their link to tasks and events). Someone with a login can't be removed: their login must be removed first in Settings › Accounts.",
  input: z.object({ person: entityRef("habitant") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Removed a household member", nl: "Gezinslid verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Remove ${input.person.name} from the household`, `${input.person.name} uit het gezin verwijderen`),
  run: async (ctx, input) => {
    if (input.person.id === ctx.user.habitantId) return { error: "You can't remove yourself." };
    await deleteHabitant(ctx.householdId, input.person.id);
    return done(`Removed ${input.person.name} from the household.`);
  },
});
