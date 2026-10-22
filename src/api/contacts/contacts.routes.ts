import { Router } from "express";
import { contactInputSchema, contactListQuerySchema, contactProjectLinkSchema } from "@/features/contacts/types/contacts";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import {
  createContact,
  deleteContact,
  getContact,
  linkContactToProject,
  listContacts,
  unlinkContactFromProject,
  updateContact,
} from "./contacts.service";

/**
 * /api/contacts: everyone in the household reads (children too: they may need the plumber's number); owners and
 * adults add, edit, delete and link contacts to projects (`canManageContacts`). Deleting a contact that works on
 * projects removes those links with it.
 */
export const contactsRouter = Router();

contactsRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

contactsRouter.get("/", async (req, res) => {
  const query = parse(contactListQuerySchema, req.query);
  res.json(await listContacts(currentUser(req).householdId, query));
});

contactsRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getContact(currentUser(req).householdId, id));
});

contactsRouter.post("/", canManage, async (req, res) => {
  const input = parse(contactInputSchema, req.body);
  res.status(201).json(await createContact(currentUser(req), input));
});

contactsRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(contactInputSchema, req.body);
  res.json(await updateContact(currentUser(req).householdId, id, input));
});

contactsRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteContact(currentUser(req).householdId, id);
  res.status(204).end();
});

// Link to a project with a role (or change the role); unlink.
contactsRouter.put("/:id/projects/:projectId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const projectId = parse(idSchema, req.params.projectId);
  const input = parse(contactProjectLinkSchema, req.body ?? {});
  res.json(await linkContactToProject(currentUser(req).householdId, id, projectId, input));
});

contactsRouter.delete("/:id/projects/:projectId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const projectId = parse(idSchema, req.params.projectId);
  res.json(await unlinkContactFromProject(currentUser(req).householdId, id, projectId));
});
