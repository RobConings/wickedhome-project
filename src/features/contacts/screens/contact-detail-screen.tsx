import { BookUserIcon, PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardTitle } from "@/components/shared/card";
import { DescriptionList, DescriptionItem } from "@/components/shared/description-list";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import type { Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import { ContactAvatar } from "../components/contact-avatar";
import { ContactFormDialog } from "../components/contact-form-dialog";
import { ContactLinks } from "../components/contact-links";
import { useContactSelections } from "../data/use-contact-selections";
import { contactSubtitle, type Contact } from "../types/contacts";

export function ContactDetailScreen({ contact, shops, canManage, initialSelections, shopSelections }: {
  contact: Contact; shops: Shop[]; canManage: boolean; initialSelections?: UseSelectionsOptions["initial"]; shopSelections?: UseSelectionsOptions["initial"];
}) {
  const { t } = useTranslation("contacts");
  const { t: tc } = useTranslation();
  const { favoriteIds, toggleFavorite } = useContactSelections({ initial: initialSelections });
  const favorite = favoriteIds.includes(contact.id);
  return <PageContainer>
    <PageHeader title={contact.name} description={contactSubtitle(contact)} icon={BookUserIcon} backTo="/contacts" actions={<>
      <FavoriteToggle active={favorite} label={t(favorite ? "favorite.remove" : "favorite.add", { name: contact.name })} onToggle={() => toggleFavorite(contact.id).catch(() => toast.error(t("favorite.failed")))} />
      {canManage && <ContactFormDialog contact={contact} shops={shops} shopSelections={shopSelections} trigger={<Button aria-label={t("actions.edit", { name: contact.name })}><PencilIcon />{tc("actions.edit")}</Button>} />}
    </>} />
    <PageGrid columns="main-sidebar">
      <Card>
        <div className="flex items-center gap-4"><ContactAvatar name={contact.name} size="lg" /><CardTitle>{t("detail.about")}</CardTitle></div>
        <ContactLinks contact={contact} all website />
        <DescriptionList>
          <DescriptionItem label={t("fields.company")}>{contact.company || t("detail.notRecorded")}</DescriptionItem>
          <DescriptionItem label={t("fields.trade")}>{contact.trade || t("detail.notRecorded")}</DescriptionItem>
          <DescriptionItem wide label={t("fields.address")}><span className="whitespace-pre-wrap">{contact.address || t("detail.notRecorded")}</span></DescriptionItem>
          <DescriptionItem label={t("fields.shop")}>{contact.shop ? <RecordLink className="underline" to={`/shops/${encodeURIComponent(contact.shop.id)}`}>{contact.shop.name}</RecordLink> : t("detail.notRecorded")}</DescriptionItem>
          {contact.notes && <DescriptionItem wide label={t("fields.notes")}><span className="whitespace-pre-wrap">{contact.notes}</span></DescriptionItem>}
        </DescriptionList>
      </Card>
      <Card className="self-start">
        <CardTitle>{t("projects.label")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("detail.projectsHint")}</p>
        {contact.projects.length ? <ul className="divide-y">{contact.projects.map((project) => <li key={project.id} className="flex flex-col gap-1 py-3">
          <RecordLink to={`/projects/${encodeURIComponent(project.id)}`} className="flex min-h-11 items-center gap-2 font-medium underline"><span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />{project.name}</RecordLink>
          {project.role && <p className="text-sm text-muted-foreground">{project.role}</p>}
        </li>)}</ul> : <p className="text-sm text-muted-foreground">{t("detail.noProjects")}</p>}
      </Card>
    </PageGrid>
  </PageContainer>;
}
