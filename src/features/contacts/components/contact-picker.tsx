import * as React from "react";
import { useTranslation } from "react-i18next";
import { type EntityPickerItem } from "@/components/shared/entity-picker";
import { contactSubtitle, tradeSynonyms, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";
import { SelectionsPicker, type SelectionsPickerBaseProps } from "@/components/shared/selections-picker";

type ContactPickerProps = SelectionsPickerBaseProps & {
  /** Contacts to choose from, e.g. from `fetchContacts()`. */
  contacts: Contact[];
};

/**
 * Choose a contact, with the user's favourite and recently used contacts on top; search also finds the company,
 * the trade in either language ("contractor" → "aannemer") and email addresses. Works in a `<Form>` via `name`.
 * After the form saves, call `recordUse(contactId)` from `useContactSelections()`.
 */
export function ContactPicker({ contacts, placeholder, labels, ...props }: ContactPickerProps) {
  const { t } = useTranslation("contacts");

  const items = React.useMemo<EntityPickerItem[]>(
    () =>
      contacts.map((contact) => ({
        id: contact.id,
        label: contact.name,
        description: contactSubtitle(contact) || undefined,
        leading: <ContactAvatar name={contact.name} size="sm" />,
        keywords: [...tradeSynonyms(contact.trade), ...contact.emails],
      })),
    [contacts],
  );

  return (
    <SelectionsPicker
      {...props}
      entityType="contact"
      items={items}
      waitForSelections
      favoriteFailedMessage={t("favorite.failed")}
      placeholder={placeholder ?? t("picker.placeholder")}
      labels={{ empty: t("picker.empty"), ...labels }}
    />
  );
}
