import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker, type EntityPickerItem } from "@/components/shared/entity-picker";
import type { UseSelectionsOptions } from "@/lib/selections";
import { useContactSelections } from "../data/use-contact-selections";
import { contactSubtitle, tradeSynonyms, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";

type ContactPickerProps = Omit<
  React.ComponentProps<typeof EntityPicker>,
  "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"
> & {
  /** Contacts to choose from, e.g. from `fetchContacts()`. */
  contacts: Contact[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Choose a contact, with the user's favourite and recently used contacts on top; search also finds the company,
 * the trade in either language ("contractor" → "aannemer") and email addresses. Works in a `<Form>` via `name`.
 * After the form saves, call `recordUse(contactId)` from `useContactSelections()`.
 */
export function ContactPicker({ contacts, initialSelections, placeholder, loading, labels, ...props }: ContactPickerProps) {
  const { t } = useTranslation("contacts");
  const selections = useContactSelections({ initial: initialSelections });
  const { favoriteIds, recentIds, toggleFavorite } = selections;

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
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      loading={loading || selections.loading}
      onToggleFavorite={(id) => toggleFavorite(id).catch(() => toast.error(t("favorite.failed")))}
      placeholder={placeholder ?? t("picker.placeholder")}
      labels={{ empty: t("picker.empty"), ...labels }}
    />
  );
}
