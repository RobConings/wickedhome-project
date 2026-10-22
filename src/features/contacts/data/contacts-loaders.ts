import i18n from "i18next";
import type { ActionFunctionArgs } from "react-router";
import { fetchShops, type Shop } from "@/features/shops";
import { formDataToObject, parseForm, toFormResult, type FormResult } from "../lib/forms";
import { contactFormSchema, contactProjectLinkSchema, type Contact } from "../types/contacts";
import {
  createContact,
  deleteContact,
  fetchContacts,
  linkContactToProject,
  unlinkContactFromProject,
  updateContact,
} from "./contacts-requests";

export const CONTACT_INTENTS = ["create", "update", "delete", "link", "unlink"] as const;
export type ContactIntent = (typeof CONTACT_INTENTS)[number];

export type ContactActionResult = FormResult & { intent?: ContactIntent; contactId?: string };

export type ContactsPageData = { contacts: Contact[]; shops: Shop[] };

export async function contactsLoader(): Promise<ContactsPageData> {
  const [contacts, shops] = await Promise.all([fetchContacts(), fetchShops().catch(() => [] as Shop[])]);
  return { contacts, shops };
}

/**
 * The contacts action (`/contacts`), also used by the project page's contacts panel: the form's `intent` says
 * what to do. `create` may link the new contact to a project right away (`projectId`, `projectRole`); `link` and
 * `unlink` take `contactId`, `projectId` and (link) `role`.
 */
export async function contactsAction({ request }: ActionFunctionArgs): Promise<ContactActionResult> {
  const formData = await request.formData();
  const intent = (formData.get("intent") as ContactIntent | null) ?? "create";
  const values = formDataToObject(formData);
  const id = String(values.id ?? "");

  try {
    switch (intent) {
      case "create":
      case "update": {
        const { data, errors } = parseForm(contactFormSchema, formData);
        if (errors) return { errors, intent };
        const { projectId, projectRole, ...input } = data;
        const contact = intent === "create" ? await createContact(input) : await updateContact(id, input);
        // Added from a project's page: linked right away, as its trade unless a role was given.
        if (intent === "create" && projectId) await linkContactToProject(contact.id, projectId, { role: projectRole ?? input.trade ?? null });
        return { ok: true, intent, contactId: contact.id };
      }
      case "delete":
        await deleteContact(id);
        return { ok: true, intent, contactId: id };
      case "link":
      case "unlink": {
        const contactId = String(values.contactId ?? "");
        const projectId = String(values.projectId ?? "");
        if (!contactId) return { errors: { contactId: [i18n.t("contacts:errors.chooseContact")] }, intent };
        if (!projectId) return { formError: i18n.t("common:errors.generic"), intent };
        if (intent === "unlink") await unlinkContactFromProject(contactId, projectId);
        else {
          const parsed = contactProjectLinkSchema.safeParse({ role: values.role });
          if (!parsed.success) return { errors: { role: parsed.error.issues.map((issue) => issue.message) }, intent };
          await linkContactToProject(contactId, projectId, parsed.data);
        }
        return { ok: true, intent, contactId };
      }
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    return {
      ...toFormResult(error, { not_found: i18n.t("contacts:errors.notFound"), forbidden: i18n.t("contacts:errors.forbidden") }),
      intent,
    };
  }
}
