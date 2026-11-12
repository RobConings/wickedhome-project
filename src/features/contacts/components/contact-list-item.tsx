import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { useTranslation } from "react-i18next";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";
import { contactSubtitle, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";
import { ContactLinks } from "./contact-links";
import { ContactProjectChips } from "./contact-project-chips";

type ContactListItemProps = {
  contact: Contact;
  isFavorite: boolean;
  /** May return a promise: the star then shows its new state until the save settles. */
  onToggleFavorite: (id: string) => void | Promise<unknown>;
  /** Owners and adults: the name opens the edit form. */
  onEdit?: (contact: Contact) => void;
};

/** Contact identity always opens its owner record, including for children. */
export function ContactName({ contact, className }: { contact: Contact; onEdit?: (contact: Contact) => void; className?: string }) {
  return <RecordLink to={`/contacts/${encodeURIComponent(contact.id)}`} className={className}>{contact.name}</RecordLink>;
}

/** One row in the contacts list (the list draws the dividers): name, trade and company, tap to call or mail, projects, star. */
export function ContactListItem({ contact, isFavorite, onToggleFavorite, onEdit }: ContactListItemProps) {
  const { t } = useTranslation("contacts");
  const subtitle = contactSubtitle(contact);
  return (
    <Inline gap="md" align="start">
      <ContactAvatar name={contact.name} size="md" />
      <Stack gap="sm" className="min-w-0 flex-1">
        <Stack gap="none" className="min-w-0">
          <ContactName contact={contact} onEdit={onEdit} className="font-medium break-words" />
          {subtitle && <span className="text-sm break-words text-muted-foreground">{subtitle}</span>}
        </Stack>
        <ContactLinks contact={contact} />
        <ContactProjectChips projects={contact.projects} />
      </Stack>
      {onEdit && <Button variant="ghost" size="icon" aria-label={t("actions.edit", { name: contact.name })} onClick={() => onEdit(contact)}><PencilIcon /></Button>}
      <FavoriteToggle
        active={isFavorite}
        label={t(isFavorite ? "favorite.remove" : "favorite.add", { name: contact.name })}
        onToggle={() => onToggleFavorite(contact.id)}
      />
    </Inline>
  );
}
