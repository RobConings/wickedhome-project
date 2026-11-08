import { useState } from "react";
import { DownloadIcon, EyeIcon, FileIcon, FolderInputIcon, PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardTitle } from "@/components/shared/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { FileMenuItemsContext, type FileMenuItems } from "../components/file-menu-items";
import { DocumentItemMenu } from "../components/document-item-menu";
import { DocumentPreviewDialog } from "../components/document-preview-dialog";
import { DocumentStorageBadge } from "../components/document-storage-badge";
import { FileRenameDialog } from "../components/file-rename-dialog";
import { MoveToFolderDialog } from "../components/move-to-folder-dialog";
import { fileSize, shortDate } from "../components/document-format";
import { folderHref, type OnDocumentAction } from "../components/document-item";
import type { DocumentActionResult } from "../data/documents-loaders";
import { documentContentUrl, previewKind, type DocumentDetail, type DocumentFolder } from "../types/documents";

export function DocumentDetailScreen({ detail, folders, canManage, fileMenuItems }: {
  detail: DocumentDetail; folders: DocumentFolder[]; canManage: boolean; fileMenuItems?: FileMenuItems;
}) {
  const { t } = useTranslation("documents");
  const { t: tc } = useTranslation();
  const { file } = detail;
  const [dialog, setDialog] = useState<"preview" | "rename" | "move" | "trash" | null>(null);
  const fetcher = useFetcher<DocumentActionResult>();
  const ready = Boolean(file.uploadedAt && !file.deletedAt);
  const onAction: OnDocumentAction = (action) => {
    if (action === "download") window.location.assign(documentContentUrl(file.id, { download: true }));
    else setDialog(action === "open" ? "preview" : action);
  };
  return <PageContainer>
    <PageHeader title={file.name} icon={FileIcon} backTo={folderHref(file.folderId)} description={`${fileSize(file.sizeBytes)} · ${file.mimeType}`} actions={ready && <>
      {previewKind(file.mimeType) !== "none" && <Button onClick={() => setDialog("preview")}><EyeIcon />{t("actions.preview")}</Button>}
      <Button asChild variant="outline"><a href={documentContentUrl(file.id, { download: true })} download={file.name}><DownloadIcon />{t("actions.download")}</a></Button>
      <FileMenuItemsContext value={fileMenuItems ?? null}><DocumentItemMenu item={{ kind: "file", file }} canManage={canManage} onAction={onAction} /></FileMenuItemsContext>
    </>} />
    {fetcher.data?.formError && <p role="alert" className="text-destructive">{fetcher.data.formError}</p>}
    {file.deletedAt ? <Card><p>{t("detail.deleted")}</p><RecordLink className="underline" to="/documents/trash">{t("trash.title")}</RecordLink></Card> : !ready && <p role="status">{t("detail.pending")}</p>}
    <PageGrid columns="main-sidebar">
      <Card><CardTitle>{t("detail.title")}</CardTitle><DocumentStorageBadge file={file} /><DescriptionList>
        <DescriptionItem label={t("detail.folder")}><RecordLink className="underline" to={folderHref(file.folderId)}>{detail.folder?.name ?? t("page.title")}</RecordLink></DescriptionItem>
        <DescriptionItem label={t("detail.type")}>{file.mimeType}</DescriptionItem>
        <DescriptionItem label={t("detail.size")}>{fileSize(file.sizeBytes)}</DescriptionItem>
        <DescriptionItem label={t("detail.uploaded")}>{file.uploadedAt ? shortDate(file.uploadedAt) : t("detail.notUploaded")}</DescriptionItem>
        <DescriptionItem label={t("detail.owner")}>{file.uploadedBy?.name ?? t("detail.unknown")}</DescriptionItem>
      </DescriptionList>
        {canManage && ready && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDialog("rename")}><PencilIcon />{t("actions.rename")}</Button><Button variant="outline" onClick={() => setDialog("move")}><FolderInputIcon />{t("actions.move")}</Button></div>}
      </Card>
      <Card className="self-start"><CardTitle>{t("detail.linked")}</CardTitle>{detail.links.length ? <ul className="divide-y">{detail.links.map((link) => <li key={`${link.entityType}:${link.entityId}`}><RecordLink to={link.href} className="flex min-h-11 items-center break-words py-3 font-medium underline">{link.name}</RecordLink></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("detail.noLinks")}</p>}</Card>
    </PageGrid>
    <DocumentPreviewDialog file={dialog === "preview" ? file : null} onOpenChange={(open) => !open && setDialog(null)} />
    {canManage && <>
      <FileRenameDialog file={dialog === "rename" ? file : null} onOpenChange={(open) => !open && setDialog(null)} />
      <MoveToFolderDialog item={dialog === "move" ? { kind: "file", file } : null} folders={folders} onOpenChange={(open) => !open && setDialog(null)} />
      <AlertDialog open={dialog === "trash"} onOpenChange={(open) => !open && setDialog(null)}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("detail.trashTitle")}</AlertDialogTitle><AlertDialogDescription>{t("detail.trashHint")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => fetcher.submit({ intent: "trash", kind: "file", id: file.id }, { method: "post" })}>{t("actions.trash")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </>}
  </PageContainer>;
}
