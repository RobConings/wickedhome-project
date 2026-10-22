import * as React from "react";
import { BookUserIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import type { Shop } from "@/features/shops";
import { useOpenFromUrl } from "@/lib/open-from-url";
import { useSamePagePending } from "@/lib/pending";
import type { UseSelectionsOptions } from "@/lib/selections";
import { ContactFormDialog } from "../components/contact-form-dialog";
import { ContactListItem } from "../components/contact-list-item";
import { ContactTile } from "../components/contact-tile";
import { useContactSelections } from "../data/use-contact-selections";
import { foldText, tradeSynonyms, type Contact } from "../types/contacts";

type ContactsScreenProps = {
  contacts: Contact[];
  /** For the "supplier's shop" field. */
  shops: Shop[];
  /** Owners and adults add, edit and delete; children look up and call. */
  canManage: boolean;
  /** Seed favourites instead of fetching them (stories). */
  initialSelections?: UseSelectionsOptions["initial"];
};

const FAVORITES_GROUP = "\u0000favorites";
const OTHER_GROUP = "￿other";

const tradeKey = (contact: Contact) => (contact.trade?.trim() ? foldText(contact.trade) : OTHER_GROUP);
const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Everyone the household deals with, grouped by trade (favourites first): tap a number to call, an address to mail;
 * the name opens the edit form. Search covers name, company, trade (in either language), numbers, addresses and
 * projects.
 */
export function ContactsScreen({ contacts, shops, canManage, initialSelections }: ContactsScreenProps) {
  const { t } = useTranslation("contacts");
  const { favoriteIds, toggleFavorite } = useContactSelections({ initial: initialSelections });
  const [creating, setCreating] = useOpenFromUrl(canManage);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const pending = useSamePagePending();

  // The trade as first typed names its group ("Aannemer" and "aannemer" are one group).
  const tradeLabels = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const contact of contacts) if (contact.trade?.trim() && !labels.has(tradeKey(contact))) labels.set(tradeKey(contact), contact.trade.trim());
    return labels;
  }, [contacts]);
  const knownTrades = React.useMemo(() => [...tradeLabels.values()], [tradeLabels]);
  const groupOrder = React.useMemo(() => [FAVORITES_GROUP, ...[...tradeLabels.keys()].sort(), OTHER_GROUP], [tradeLabels]);

  const handleToggleFavorite = (id: string) => toggleFavorite(id).catch(() => toast.error(t("favorite.failed")));
  const onEdit = canManage ? setEditing : undefined;

  const addButton = canManage && (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon />
      {t("actions.add")}
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={addButton} />

      <GeneralList
        label={t("page.title")}
        items={contacts}
        getKey={(contact) => contact.id}
        renderRow={(contact) => (
          <ContactListItem contact={contact} isFavorite={favoriteIds.includes(contact.id)} onToggleFavorite={handleToggleFavorite} onEdit={onEdit} />
        )}
        renderTile={(contact) => (
          <ContactTile contact={contact} isFavorite={favoriteIds.includes(contact.id)} onToggleFavorite={handleToggleFavorite} onEdit={onEdit} />
        )}
        search={{
          keys: (contact) => [
            contact.name,
            contact.company,
            ...tradeSynonyms(contact.trade),
            ...contact.emails,
            ...contact.phones,
            ...contact.phones.map((phone) => phone.replace(/\D/g, "")),
            ...contact.projects.flatMap((project) => [project.name, project.role]),
          ],
          label: t("filter.search"),
          placeholder: t("filter.search"),
        }}
        storageKey="contacts"
        defaultView="list"
        pending={pending}
        groupBy={(contact) => (favoriteIds.includes(contact.id) ? [FAVORITES_GROUP, tradeKey(contact)] : tradeKey(contact))}
        groupOrder={groupOrder}
        groupColumns={2}
        renderGroupHeader={(key, list) => (
          <span className="flex items-center gap-2">
            {key === FAVORITES_GROUP ? t("groups.favorites") : key === OTHER_GROUP ? t("groups.other") : capitalise(tradeLabels.get(key) ?? key)}
            <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
          </span>
        )}
        emptyState={<EmptyState icon={BookUserIcon} title={t("empty.title")} description={t("empty.description")} action={addButton} />}
      />

      {canManage && (
        <ContactFormDialog shops={shops} knownTrades={knownTrades} open={creating} onOpenChange={setCreating} />
      )}
      {canManage && editing && (
        <ContactFormDialog
          key={editing.id}
          contact={editing}
          shops={shops}
          knownTrades={knownTrades}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </PageContainer>
  );
}
