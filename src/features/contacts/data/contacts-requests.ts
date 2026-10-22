import { api } from "../lib/api-client";
import type { Contact, ContactInput, ContactListQuery, ContactProjectLinkInput } from "../types/contacts";

const path = (id: string) => `/contacts/${encodeURIComponent(id)}`;

/** The household's contacts by name; `projectId` narrows to one project's, `q` searches. */
export function fetchContacts(query: ContactListQuery = {}) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.projectId) params.set("projectId", query.projectId);
  const search = params.toString();
  return api.get<Contact[]>(`/contacts${search ? `?${search}` : ""}`);
}

export const fetchContact = (id: string) => api.get<Contact>(path(id));
export const createContact = (input: ContactInput) => api.post<Contact>("/contacts", input);
export const updateContact = (id: string, input: ContactInput) => api.put<Contact>(path(id), input);
export const deleteContact = (id: string) => api.delete(path(id));
export const linkContactToProject = (id: string, projectId: string, input: ContactProjectLinkInput) =>
  api.put<Contact>(`${path(id)}/projects/${encodeURIComponent(projectId)}`, input);
export const unlinkContactFromProject = (id: string, projectId: string) =>
  api.delete(`${path(id)}/projects/${encodeURIComponent(projectId)}`);
