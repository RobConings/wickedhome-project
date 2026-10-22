import { useTranslation } from "react-i18next";
import type { GeneralFormField } from "./general-form";
import { GeneralFormDialog } from "./general-form-dialog";
import { folderFormSchema, type DocumentActionResult } from "../data/documents-loaders";
import type { DocumentFolder } from "../types/documents";
import { FolderGlyph } from "./folder-glyph";

/** Folder colours: the brand greens, then the chart palette. */
const FOLDER_COLORS = ["#124734", "#6b8f73", "#2a78d6", "#4a3aa7", "#e87ba4", "#e34948", "#eb6834", "#eda100", "#1baf7a", "#64748b"] as const;

type FolderFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rename/recolour this folder; omit to create a new one. */
  folder?: DocumentFolder | null;
  /** Where a new folder goes; `null` = the drive root. */
  parentId?: string | null;
};

/** Create a folder, or rename and recolour one. Posts to the current route's action. */
export function FolderFormDialog({ open, onOpenChange, folder, parentId = null }: FolderFormDialogProps) {
  const { t } = useTranslation("documents");
  const isEdit = Boolean(folder);

  const fields: GeneralFormField[] = [
    {
      name: "name",
      type: "text",
      label: t("folderForm.name"),
      placeholder: t("folderForm.namePlaceholder"),
      maxLength: 200,
      autoFocus: true,
    },
    { name: "color", type: "color", label: t("folderForm.color"), colors: FOLDER_COLORS },
  ];

  return (
    <GeneralFormDialog<DocumentActionResult>
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("folderForm.editTitle") : t("folderForm.createTitle")}
      description={t("folderForm.description")}
      media={(values) => (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent">
          <FolderGlyph color={typeof values.color === "string" && values.color ? values.color : null} />
        </span>
      )}
      successMessage={isEdit ? t("folderForm.updated") : t("folderForm.created")}
      schema={folderFormSchema}
      fields={fields}
      intent={isEdit ? "update-folder" : "create-folder"}
      // A new folder goes into `parentId`; empty = the drive root (the action reads a missing id as root).
      hiddenFields={isEdit ? { id: folder?.id } : { parentId }}
      defaultValues={{ name: folder?.name ?? "", color: folder?.color ?? "" }}
      submitLabel={isEdit ? undefined : t("folderForm.create")}
      contentClassName="sm:max-w-md"
    />
  );
}
