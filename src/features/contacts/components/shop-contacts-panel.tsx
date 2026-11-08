import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Shop } from "@/features/shops";
import { useAsyncResource } from "@/lib/use-async-resource";
import { fetchContacts } from "../data/contacts-requests";
import { contactSubtitle, type Contact } from "../types/contacts";
import { ContactAvatar } from "./contact-avatar";
import { ContactFormDialog } from "./contact-form-dialog";
import { ContactLinks } from "./contact-links";
import { ContactName } from "./contact-list-item";

/** Contacts owns both the supplier relationship and its form; Shops only provides a slot. */
export function ShopContactsPanel({ shop, canManage, initialData }: { shop: Shop; canManage: boolean; initialData?: Contact[] }) {
  const { t } = useTranslation("contacts");
  const { t: common } = useTranslation();
  const { data, error, loading, refresh } = useAsyncResource(`shop-contacts:${shop.id}`, () => fetchContacts({ shopId: shop.id }), { initial: initialData });
  return <Card tone="section">
    <div><CardTitle>{t("shop.title")}</CardTitle><CardDescription>{t("shop.description")}</CardDescription></div>
    {loading && <Skeleton className="h-20 rounded-xl" aria-label={t("project.loading")} />}
    {error && <div role="status" className="flex flex-col items-start gap-2 text-sm"><p>{t("project.error")}</p><Button size="sm" variant="outline" onClick={refresh}>{common("actions.retry")}</Button></div>}
    {data && (data.length ? <ul className="divide-y">{data.map((contact) => <li key={contact.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <ContactAvatar name={contact.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div><ContactName contact={contact} className="font-medium break-words text-primary hover:underline" />
          {contactSubtitle(contact) && <p className="text-sm break-words text-muted-foreground">{contactSubtitle(contact)}</p>}</div>
        <ContactLinks contact={contact} />
      </div>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">{t("shop.empty")}</p>)}
    {canManage && <ContactFormDialog shops={[shop]} defaultShopId={shop.id} defaultTrade={t("shop.trade")} action="/contacts" onSaved={refresh}
      trigger={<Button variant="outline" size="sm" fullOnMobile><PlusIcon />{t("project.new")}</Button>} />}
  </Card>;
}
