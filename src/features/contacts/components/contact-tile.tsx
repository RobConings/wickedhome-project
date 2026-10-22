import { useTranslation } from "react-i18next";
import { Inline } from "./inline";
import { Card } from "./card";
import { FavoriteToggle } from "./favorite-toggle";
import { contactSubtitle, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";
import { ContactLinks } from "./contact-links";
import { ContactName } from "./contact-list-item";
import { ContactProjectChips } from "./contact-project-chips";

type ContactTileProps = {
  contact: Contact;
  isFavorite: boolean;
  /** May return a promise: the star then shows its new state until the save settles. */
  onToggleFavorite: (id: string) => void | Promise<unknown>;
  /** Owners and adults: the name opens the edit form. */
  onEdit?: (contact: Contact) => void;
};

/** A contact as a tile: initials, name (opens the edit form), trade and company, every number and address to tap, website, projects, star. */
export function ContactTile({ contact, isFavorite, onToggleFavorite, onEdit }: ContactTileProps) {
  const { t } = useTranslation("contacts");
  const subtitle = contactSubtitle(contact);
  return (
    <Card className="gap-3 p-4">
      <Inline justify="between" align="start">
        <ContactAvatar name={contact.name} size="lg" />
        <FavoriteToggle
          className="-mt-1 -mr-1"
          active={isFavorite}
          label={t(isFavorite ? "favorite.remove" : "favorite.add", { name: contact.name })}
          onToggle={() => onToggleFavorite(contact.id)}
        />
      </Inline>
      <div className="flex min-w-0 flex-col">
        <ContactName contact={contact} onEdit={onEdit} className="font-medium break-words" />
        {subtitle && <span className="text-sm break-words text-muted-foreground">{subtitle}</span>}
        {contact.address && <span className="pt-1 text-sm break-words text-muted-foreground">{contact.address}</span>}
      </div>
      <ContactLinks contact={contact} all website />
      <ContactProjectChips projects={contact.projects} />
    </Card>
  );
}
