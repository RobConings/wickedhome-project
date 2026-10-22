import { useTranslation } from "react-i18next";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";
import { cn } from "@/lib/utils";
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

/** The contact's name: a button that opens the edit form for those who may edit, plain text otherwise. */
export function ContactName({ contact, onEdit, className }: { contact: Contact; onEdit?: (contact: Contact) => void; className?: string }) {
  const { t } = useTranslation("contacts");
  if (!onEdit) return <span className={className}>{contact.name}</span>;
  return (
    <button
      type="button"
      onClick={() => onEdit(contact)}
      title={t("actions.edit", { name: contact.name })}
      className={cn("text-left underline-offset-4 outline-none hover:underline focus-visible:underline", className)}
    >
      {contact.name}
    </button>
  );
}

/** One row in the contacts list (the list draws the dividers): name, trade and company, tap to call or mail, projects, star. */
export function ContactListItem({ contact, isFavorite, onToggleFavorite, onEdit }: ContactListItemProps) {
  const { t } = useTranslation("contacts");
  const subtitle = contactSubtitle(contact);
  return (
    <div className="flex items-start gap-3">
      <ContactAvatar name={contact.name} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-col">
          <ContactName contact={contact} onEdit={onEdit} className="font-medium break-words" />
          {subtitle && <span className="text-sm break-words text-muted-foreground">{subtitle}</span>}
        </div>
        <ContactLinks contact={contact} />
        <ContactProjectChips projects={contact.projects} />
      </div>
      <FavoriteToggle
        active={isFavorite}
        label={t(isFavorite ? "favorite.remove" : "favorite.add", { name: contact.name })}
        onToggle={() => onToggleFavorite(contact.id)}
      />
    </div>
  );
}
