import { api, restResource } from "@/lib/api-client";
import type { Contact, ContactInput, ContactListQuery, ContactProjectLinkInput } from "../types/contacts";

const contacts = restResource<Contact, ContactInput>("/contacts");

/** The household's contacts by name; `projectId` narrows to one project's, `q` searches. */
export const fetchContacts = (query: ContactListQuery = {}) => contacts.list({ q: query.q, projectId: query.projectId });

export const fetchContact = contacts.get;
export const createContact = contacts.create;
export const updateContact = contacts.update;
export const deleteContact = contacts.remove;
export const linkContactToProject = (id: string, projectId: string, input: ContactProjectLinkInput) =>
  api.put<Contact>(contacts.path(id, "projects", projectId), input);
export const unlinkContactFromProject = (id: string, projectId: string) => api.delete(contacts.path(id, "projects", projectId));
