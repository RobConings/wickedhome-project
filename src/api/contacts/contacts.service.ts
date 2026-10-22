import type { SessionUser } from "@/features/auth/types/auth";
import {
  foldText,
  tradeSynonyms,
  type Contact,
  type ContactInput,
  type ContactListQuery,
  type ContactProjectLinkInput,
} from "@/features/contacts/types/contacts";
import { db, type Prisma } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { forgetEntity } from "../selections/selections.service";

/**
 * Contacts: the people and organisations the household deals with, linked to projects with a role. Household
 * scoped (another household's contact or project is a 404). Roles are checked by the routes and the assistant
 * tools (`canManageContacts`): everyone reads, owners and adults change.
 *
 * Deleting a contact that works on projects is allowed: the links are removed with it (the projects stay).
 */

const contactInclude = {
  shop: { select: { id: true, name: true } },
  projects: { include: { project: { select: { id: true, name: true, color: true, status: true } } } },
} satisfies Prisma.ContactInclude;

type ContactRow = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;

const RUNNING_STATUSES = new Set(["PLANNED", "ACTIVE"]);

export function toContact(row: ContactRow): Contact {
  const projects = row.projects
    .map((link) => ({
      id: link.project.id,
      name: link.project.name,
      color: link.project.color,
      role: link.role,
      running: RUNNING_STATUSES.has(link.project.status),
    }))
    .sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name));
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    trade: row.trade,
    emails: row.emails,
    phones: row.phones,
    address: row.address,
    websiteUrl: row.websiteUrl,
    notes: row.notes,
    shop: row.shop,
    projects,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Does a contact match a search? Every typed word must appear in its name, company, trade or project role (in
 * either language: "contractor" finds "aannemer"), an email address, a phone number (digits only) or the name of
 * a linked project. Case and accents are ignored.
 */
export function contactMatches(contact: Contact, query: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const texts = [
    contact.name,
    contact.company ?? "",
    ...tradeSynonyms(contact.trade),
    ...contact.emails,
    ...contact.projects.flatMap((project) => [project.name, ...tradeSynonyms(project.role)]),
  ].map(foldText);
  const digits = contact.phones.map((phone) => phone.replace(/\D/g, ""));
  return words.every((word) => {
    if (texts.some((text) => text.includes(word))) return true;
    const wordDigits = word.replace(/[\s./()+-]/g, "");
    return /^\d{3,}$/.test(wordDigits) && digits.some((phone) => phone.includes(wordDigits.replace(/^0/, "")));
  });
}

const toData = (input: ContactInput) => ({
  name: input.name,
  company: input.company || null,
  trade: input.trade || null,
  emails: input.emails,
  phones: input.phones,
  address: input.address || null,
  websiteUrl: input.websiteUrl || null,
  notes: input.notes || null,
  shopId: input.shopId || null,
});

/** The shop must be visible to the household (its own or a built-in catalogue shop). */
async function checkShop(householdId: string, shopId: string | null | undefined) {
  if (!shopId) return;
  const shop = await db.shop.findFirst({ where: { id: shopId, OR: [{ householdId }, { householdId: null }] }, select: { id: true } });
  if (!shop) throw badRequest("Unknown shop", { shopId: ["unknownShop"] });
}

async function findContactRow(householdId: string, id: string) {
  const row = await db.contact.findFirst({ where: { id, householdId }, include: contactInclude });
  if (!row) throw notFound("Contact not found");
  return row;
}

async function checkProject(householdId: string, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, householdId }, select: { id: true } });
  if (!project) throw notFound("Project not found");
}

/** The household's contacts by name, optionally only those of one project and/or matching a search. */
export async function listContacts(householdId: string, { q, projectId }: ContactListQuery = {}): Promise<Contact[]> {
  const rows = await db.contact.findMany({
    where: { householdId, ...(projectId && { projects: { some: { projectId } } }) },
    include: contactInclude,
    orderBy: { name: "asc" },
  });
  const contacts = rows.map(toContact);
  return q ? contacts.filter((contact) => contactMatches(contact, q)) : contacts;
}

export async function getContact(householdId: string, id: string): Promise<Contact> {
  return toContact(await findContactRow(householdId, id));
}

export async function createContact(user: SessionUser, input: ContactInput): Promise<Contact> {
  await checkShop(user.householdId, input.shopId);
  const row = await db.contact.create({
    data: { householdId: user.householdId, createdByUserId: user.id, ...toData(input) },
    include: contactInclude,
  });
  return toContact(row);
}

export async function updateContact(householdId: string, id: string, input: ContactInput): Promise<Contact> {
  await findContactRow(householdId, id);
  await checkShop(householdId, input.shopId);
  const row = await db.contact.update({ where: { id }, data: toData(input), include: contactInclude });
  return toContact(row);
}

/** Deletes the contact and its project links (the projects stay); forgets it in everyone's favourites and recents. */
export async function deleteContact(householdId: string, id: string): Promise<void> {
  await findContactRow(householdId, id);
  await db.contact.delete({ where: { id } });
  await forgetEntity("contact", id);
}

/** Links the contact to a project with a role, or changes the role when it is linked already. */
export async function linkContactToProject(householdId: string, id: string, projectId: string, input: ContactProjectLinkInput): Promise<Contact> {
  await findContactRow(householdId, id);
  await checkProject(householdId, projectId);
  const role = input.role || null;
  await db.projectContact.upsert({
    where: { projectId_contactId: { projectId, contactId: id } },
    create: { projectId, contactId: id, role },
    update: { role },
  });
  return getContact(householdId, id);
}

/** Removes the contact from a project (nothing happens when it wasn't linked). */
export async function unlinkContactFromProject(householdId: string, id: string, projectId: string): Promise<Contact> {
  await findContactRow(householdId, id);
  await checkProject(householdId, projectId);
  await db.projectContact.deleteMany({ where: { projectId, contactId: id } });
  return getContact(householdId, id);
}
