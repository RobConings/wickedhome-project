import { z } from "zod";
import { contactEmailSchema, contactInputSchema, contactPhoneSchema, MAX_CONTACT_VALUES, type Contact } from "@/features/contacts/types/contacts";
import {
  createContact,
  deleteContact,
  getContact,
  linkContactToProject,
  listContacts,
  unlinkContactFromProject,
  updateContact,
} from "@/api/contacts/contacts.service";
import { badRequest } from "@/api/lib/http";
import { getSelections } from "@/api/selections/selections.service";
import {
  capList,
  done,
  entityRef,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  type AssistantToolContext,
} from "@ai/core/kit";
import { fieldsPreview } from "../expenses/shared";
import { contactCandidate, narrowContacts, searchWords } from "./contact-match";

/**
 * Skill "contacts": the people and organisations the household deals with (contractor, plumber, supplier, bank,
 * school…), linked to projects with a role (guide: guide.md). Registers the `contact` resolver: tools elsewhere
 * (mail) take `entityRef("contact")` and read `data.email` / `data.phone` (see `ContactRefData` in contact-match.ts).
 * Everyone may look contacts up, as in the app; changes are for owners and adults and always confirmed.
 */

registerAssistantSkill({
  id: "contacts",
  title: { en: "Contacts", nl: "Contacten" },
  summary: "Contacts (contractor, plumber, supplier, bank, school…): find by name, company or trade, phone and email, projects they work on; add, edit, link to a project, delete.",
  keywords: {
    nl: ["contact", "contacten", "contactpersoon", "adresboek", "aannemer", "loodgieter", "elektricien", "schrijnwerker", "dakwerker", "tuinaannemer", "leverancier", "architect", "vakman", "telefoonnummer", "gsm-nummer", "e-mailadres", "mailadres"],
    en: ["contact", "contacts", "address book", "contractor", "plumber", "electrician", "carpenter", "roofer", "landscaper", "supplier", "architect", "tradesman", "phone number", "email address"],
  },
});

registerEntityResolver({
  type: "contact",
  label: "contact",
  skill: "contacts",
  // `list` feeds mention routing ("en Peeters?") and id → name maps; `search` resolves a reference with the
  // contacts' own rules ("de aannemer" → the contractor on a running project, see contact-match.ts).
  list: async (ctx) => (await listContacts(ctx.householdId)).map(contactCandidate),
  search: async (ctx, query) => narrowContacts(query, await listContacts(ctx.householdId)),
});

const LIST_LIMIT = 20;

const projectsText = (contact: Contact) =>
  contact.projects.length ? contact.projects.map((project) => `${project.name}${project.role ? ` (${project.role})` : ""}${project.running ? "" : ", finished"}`).join("; ") : null;

const row = (contact: Contact, favorite: boolean) => ({
  name: contact.name,
  company: contact.company,
  trade: contact.trade,
  email: contact.emails[0] ?? null,
  phone: contact.phones[0] ?? null,
  projects: projectsText(contact),
  favorite: favorite || null,
});

registerAssistantTool({
  name: "contacts.find",
  description:
    "Find contacts by name, company, trade (aannemer, plumber, bank…) or project, with email, phone and the projects they work on. Give a contact for all details (every number and address, website, notes). For 'wat is het nummer van de loodgieter'.",
  input: z.object({
    contact: entityRef("contact", "One contact's full details: name, company or trade").optional(),
    query: z.string().trim().max(100).optional().describe("Name, company or trade words, e.g. 'aannemer' or 'Peeters'"),
    project: entityRef("project", "Only the contacts of this project").optional(),
    favorites: z.boolean().optional().describe("Only the person's favourite contacts"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked up contacts", nl: "Contacten opgezocht" },
  run: async (ctx, input) => {
    const favorites = new Set((await getSelections(ctx.user.id, "contact")).favoriteIds);
    if (input.contact) {
      const contact = await getContact(ctx.householdId, input.contact.id);
      return {
        ...row(contact, favorites.has(contact.id)),
        id: contact.id,
        emails: contact.emails.length > 1 ? contact.emails : null,
        phones: contact.phones.length > 1 ? contact.phones : null,
        address: contact.address,
        website: contact.websiteUrl,
        shop: contact.shop?.name ?? null,
        notes: contact.notes,
      };
    }
    const q = input.query ? searchWords(input.query).join(" ") : undefined;
    const contacts = (await listContacts(ctx.householdId, { q: q || undefined, projectId: input.project?.id })).filter((contact) => !input.favorites || favorites.has(contact.id));
    contacts.sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
    return { count: contacts.length, ...capList(contacts, LIST_LIMIT, (contact) => row(contact, favorites.has(contact.id))) };
  },
});

// ── Add and edit ────────────────────────────────────────────────────────────────────────────────────

const saveInput = z.object({
  contact: entityRef("contact", "The contact to change; leave out to add one").optional(),
  name: z.string().trim().min(1).max(100).optional().describe("Required for a new contact"),
  company: z.string().trim().max(100).optional(),
  trade: z.string().trim().max(60).optional().describe("Trade or role as people say it, e.g. aannemer, loodgieter, bank, school"),
  email: contactEmailSchema.optional().describe("Email address; becomes the primary one"),
  phone: contactPhoneSchema.optional().describe("Phone number; becomes the primary one"),
  address: z.string().trim().max(300).optional(),
  website: z.url({ protocol: /^https?$/ }).max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  shop: entityRef("shop", "The supplier's shop").optional(),
  project: entityRef("project", "Also link the contact to this project").optional(),
  role: z.string().trim().max(60).optional().describe("Role in that project (default: the trade)"),
});
type SaveInput = z.output<typeof saveInput>;

/** `value` first, the rest after it, without duplicates, at most the maximum. */
const primaryFirst = (value: string | undefined, current: string[]) =>
  value ? [value, ...current.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, MAX_CONTACT_VALUES) : current;

async function contactInputOf(ctx: AssistantToolContext, input: SaveInput) {
  const before = input.contact ? await getContact(ctx.householdId, input.contact.id) : null;
  const name = input.name ?? before?.name;
  if (!name) throw badRequest("A new contact needs a name");
  const data = contactInputSchema.parse({
    name,
    company: input.company ?? before?.company ?? null,
    trade: input.trade ?? before?.trade ?? null,
    emails: primaryFirst(input.email, before?.emails ?? []),
    phones: primaryFirst(input.phone, before?.phones ?? []),
    address: input.address ?? before?.address ?? null,
    websiteUrl: input.website ?? before?.websiteUrl ?? null,
    notes: input.notes ?? before?.notes ?? null,
    shopId: input.shop?.id ?? before?.shop?.id ?? null,
  });
  return { before, data };
}

registerAssistantTool({
  name: "contacts.save",
  description: "Add a contact or change one (name, company, trade, email, phone, address, website, notes, shop). Only pass what changes. Optionally link it to a project with a role at once.",
  input: saveInput,
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a contact", nl: "Contact bewaard" },
  describe: (ctx, input) =>
    input.contact
      ? say(ctx.locale, `Change the contact ${input.contact.name}`, `Contact ${input.contact.name} wijzigen`)
      : say(ctx.locale, `Add the contact ${input.name ?? "?"}`, `Contact ${input.name ?? "?"} toevoegen`),
  preview: async (ctx, input) => {
    const { before, data } = await contactInputOf(ctx, input);
    const change = (from: string | null | undefined, to: string | null | undefined) => (before ? ((from ?? "") === (to ?? "") ? null : `${from || "–"} → ${to || "–"}`) : to);
    const list = (values: string[] | undefined) => values?.join(", ") || null;
    return fieldsPreview(ctx.locale, before ? [`Change ${before.name}`, `${before.name} wijzigen`] : ["New contact", "Nieuw contact"], [
      [["Name", "Naam"], change(before?.name, data.name)],
      [["Company", "Bedrijf"], change(before?.company, data.company)],
      [["Trade", "Vak"], change(before?.trade, data.trade)],
      [["Email", "E-mail"], change(list(before?.emails), list(data.emails))],
      [["Phone", "Telefoon"], change(list(before?.phones), list(data.phones))],
      [["Address", "Adres"], change(before?.address, data.address)],
      [["Website", "Website"], change(before?.websiteUrl, data.websiteUrl)],
      [["Shop", "Winkel"], input.shop ? input.shop.name : null],
      [["Notes", "Notities"], change(before?.notes, data.notes)],
      [["Project", "Project"], input.project ? `${input.project.name}${input.role || data.trade ? ` (${input.role ?? data.trade})` : ""}` : null],
    ]);
  },
  run: async (ctx, input) => {
    const { before, data } = await contactInputOf(ctx, input);
    let contact = before ? await updateContact(ctx.householdId, before.id, data) : await createContact(ctx.user, data);
    if (input.project) contact = await linkContactToProject(ctx.householdId, contact.id, input.project.id, { role: input.role ?? contact.trade });
    const linked = input.project ? ` and linked it to ${input.project.name}` : "";
    return done(`${before ? "Changed" : "Added"} the contact ${contact.name}${linked}.`, { id: contact.id });
  },
});

// ── Projects ────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "contacts.link",
  description: "Link a contact to a project with their role there (aannemer, architect…), change the role, or unlink it.",
  input: z.object({
    contact: entityRef("contact"),
    project: entityRef("project"),
    role: z.string().trim().max(60).optional().describe("Role in the project (default: the contact's trade)"),
    unlink: z.boolean().optional().describe("Remove the contact from the project instead"),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed a project contact", nl: "Projectcontact gewijzigd" },
  describe: (ctx, input) =>
    input.unlink
      ? say(ctx.locale, `Remove ${input.contact.name} from ${input.project.name}`, `${input.contact.name} uit ${input.project.name} halen`)
      : say(
          ctx.locale,
          `Link ${input.contact.name} to ${input.project.name}${input.role ? ` as ${input.role}` : ""}`,
          `${input.contact.name} koppelen aan ${input.project.name}${input.role ? ` als ${input.role}` : ""}`,
        ),
  run: async (ctx, input) => {
    if (input.unlink) {
      await unlinkContactFromProject(ctx.householdId, input.contact.id, input.project.id);
      return done(`Removed ${input.contact.name} from ${input.project.name}.`);
    }
    const current = await getContact(ctx.householdId, input.contact.id);
    const contact = await linkContactToProject(ctx.householdId, current.id, input.project.id, { role: input.role ?? current.trade });
    const role = contact.projects.find((project) => project.id === input.project.id)?.role;
    return done(`Linked ${contact.name} to ${input.project.name}${role ? ` as ${role}` : ""}.`);
  },
});

registerAssistantTool({
  name: "contacts.delete",
  description: "Delete a contact. Its project links go with it; the projects stay.",
  input: z.object({ contact: entityRef("contact") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a contact", nl: "Contact verwijderd" },
  describe: async (ctx, input) => {
    const { projects } = await getContact(ctx.householdId, input.contact.id);
    return projects.length
      ? say(ctx.locale, `Delete the contact ${input.contact.name} (and the links to ${projects.length} project(s))`, `Contact ${input.contact.name} verwijderen (en de koppeling met ${projects.length} project(en))`)
      : say(ctx.locale, `Delete the contact ${input.contact.name}`, `Contact ${input.contact.name} verwijderen`);
  },
  run: async (ctx, input) => {
    await deleteContact(ctx.householdId, input.contact.id);
    return done(`Deleted the contact ${input.contact.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): the contacts ──

registerScreenContext({
  kind: "contacts",
  skills: ["contacts"],
  describe: (ctx) => ({ label: say(ctx.locale, "Contacts", "Contacten"), summary: "the contacts list" }),
});
