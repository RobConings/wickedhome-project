import * as React from "react";
import { HardDriveIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { Stack } from "../components/stack";
import { BreadcrumbTrail } from "../components/breadcrumb-trail";
import { ConfirmDialog } from "../components/confirm-dialog";
import { EmptyState } from "../components/empty-state";
import { GeneralList } from "../components/general-list";
import { InlineAlert } from "../components/inline-alert";
import { PageHeader } from "../components/page-header";
import { fileSize } from "../components/document-format";
import { itemId, itemName, type DocumentItem } from "../components/document-item";
import { StorageUsageMeter } from "../components/storage-usage-meter";
import type { TrashBusy } from "../components/trash-item";
import { TrashListItem } from "../components/trash-list-item";
import { TrashTile } from "../components/trash-tile";
import type { DocumentActionResult } from "../data/documents-loaders";
import { useSettled } from "../data/use-settled";
import type { DocumentTrash, StorageUsage } from "../types/documents";

type DocumentsTrashScreenProps = {
  trash: DocumentTrash;
  /** Deferred by the loader: the meter shows a skeleton until it is there. */
  usage: Promise<StorageUsage>;
  /** Owners and adults restore and delete; children only look. */
  canManage: boolean;
};

type TrashIntent = "restore" | "delete" | "empty-trash";

/** Trashed folders and files: restore them, delete them one by one, or empty the trash. */
export function DocumentsTrashScreen({ trash, usage: usagePromise, canManage }: DocumentsTrashScreenProps) {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();
  const usage = useSettled(usagePromise);
  const revalidator = useRevalidator();
  const fetcher = useFetcher<DocumentActionResult>({ key: "documents-trash-screen" });
  const last = React.useRef<{ intent: TrashIntent; item?: DocumentItem } | null>(null);
  const items: DocumentItem[] = [
    ...trash.folders.map((folder) => ({ kind: "folder" as const, folder })),
    ...trash.files.map((file) => ({ kind: "file" as const, file })),
  ];
  const isEmpty = items.length === 0;

  // One action at a time: the item (or the whole trash) it is about shows as busy until the list reloaded.
  const busy: TrashBusy | null =
    fetcher.state !== "idle" && fetcher.formData
      ? {
          intent: String(fetcher.formData.get("intent")) as TrashIntent,
          id: (fetcher.formData.get("id") as string | null) ?? undefined,
        }
      : null;

  React.useEffect(() => {
    const action = last.current;
    if (fetcher.state !== "idle" || !fetcher.data || !action) return;
    last.current = null;
    if (!fetcher.data.ok) return; // shown inline below
    const name = action.item ? itemName(action.item) : "";
    if (action.intent === "restore") toast.success(t("trash.restored", { name }));
    else if (action.intent === "delete") toast.success(t("trash.deleted", { name }));
    else toast.success(t("trash.emptied"));
  }, [fetcher.state, fetcher.data, t]);

  /** Returns the submit's promise, so a confirm dialog stays open (busy) until the action and reload are done. */
  const submit = (intent: TrashIntent, item?: DocumentItem) => {
    last.current = { intent, item };
    return fetcher.submit(item ? { intent, kind: item.kind, id: itemId(item) } : { intent }, { method: "post" });
  };

  const itemProps = {
    canManage,
    busy,
    onRestore: (item: DocumentItem) => submit("restore", item),
    onDelete: (item: DocumentItem) => submit("delete", item),
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <BreadcrumbTrail
            label={t("breadcrumbs")}
            items={[{ label: t("page.title"), to: "/documents", icon: HardDriveIcon }, { label: t("trash.title") }]}
          />
        }
        title={t("trash.title")}
        description={t("trash.description")}
        actions={
          canManage &&
          !isEmpty && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" disabled={busy !== null}>
                  <Trash2Icon />
                  {t("actions.emptyTrash")}
                </Button>
              }
              title={t("trash.emptyTitle")}
              description={t("trash.emptyDescription", { size: fileSize(trash.totalBytes) })}
              confirmLabel={t("actions.emptyTrash")}
              cancelLabel={tCommon("actions.cancel")}
              destructive
              onConfirm={() => submit("empty-trash")}
            />
          )
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <Stack gap="md">
          {fetcher.state === "idle" && fetcher.data?.formError && (
            <InlineAlert tone="error">{fetcher.data.formError}</InlineAlert>
          )}
          <GeneralList
            label={t("trash.title")}
            items={items}
            getKey={(item) => `${item.kind}-${itemId(item)}`}
            renderRow={(item) => <TrashListItem item={item} {...itemProps} />}
            renderTile={(item) => <TrashTile item={item} {...itemProps} />}
            search={{ keys: (item) => [itemName(item)], label: t("trash.search"), placeholder: t("trash.search") }}
            storageKey="documents-trash"
            defaultView="list"
            emptyState={
              <EmptyState
                icon={Trash2Icon}
                title={t("trash.emptyStateTitle")}
                description={t("trash.emptyStateDescription")}
              />
            }
          />
        </Stack>
        <StorageUsageMeter usage={usage.value} failed={usage.failed} onRetry={() => void revalidator.revalidate()} />
      </div>
    </PageContainer>
  );
}
