import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { ShoppingItemScreen, shoppingItemAction, shoppingItemLoader, canManageShopping } from "@/features/shopping";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { screenHandle } from "@/lib/screen-context";
export const loader = shoppingItemLoader;
export const action = shoppingItemAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({ kind: "shopping_item", id: data.item.id, label: data.item.name }));
export function Component() {
  const data = useLoaderData<typeof loader>();
  const user = useCurrentUser();
  const { t } = useTranslation("documents");
  const refs = data.item.requirements ?? [data.item];
  return <ShoppingItemScreen key={data.item.id} {...data} canManage={canManageShopping(user.role)} attachments={<>
    {refs.map((ref) => <DocumentAttachments key={ref.id} title={refs.length > 1 ? `${t("page.title")} · ${ref.listName}` : undefined} entityType="shopping_item" entityId={ref.id} canManage={canManageDocuments(user.role)} />)}
  </>} />;
}
