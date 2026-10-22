import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { FileTypeIcon } from "@/components/shared/file-type-icon";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { fileRenameFormSchema, type DocumentActionResult } from "../data/documents-loaders";
import type { DocumentFile } from "../types/documents";

type FileRenameDialogProps = {
  /** The file to rename; `null` closes the dialog. */
  file: DocumentFile | null;
  onOpenChange: (open: boolean) => void;
};

/** Selects the name without its extension, like a file manager. */
const selectBaseName = (input: HTMLInputElement) => {
  if (document.activeElement !== input) return;
  const dot = input.value.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
};

/** Rename a file. The name is selected without its extension, like a file manager. */
export function FileRenameDialog({ file, onOpenChange }: FileRenameDialogProps) {
  const { t } = useTranslation("documents");
  // Keep showing the last file while the dialog animates closed.
  const [shown, setShown] = React.useState(file);
  if (file && file !== shown) setShown(file);

  const fields: GeneralFormField[] = [
    {
      name: "name",
      type: "custom",
      label: t("renameForm.name"),
      render: ({ id, name, value, setValue, invalid, describedBy, disabled }) => (
        <Input
          id={id}
          name={name}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => selectBaseName(event.currentTarget)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          autoComplete="off"
          maxLength={200}
          autoFocus
        />
      ),
    },
  ];

  return (
    <GeneralFormDialog<DocumentActionResult>
      key={shown?.id ?? "none"}
      open={file !== null}
      onOpenChange={onOpenChange}
      title={t("renameForm.title")}
      description={shown && <span className="break-all">{shown.name}</span>}
      media={() => shown && <FileTypeIcon mimeType={shown.mimeType} name={shown.name} />}
      successMessage={t("renameForm.renamed")}
      schema={fileRenameFormSchema}
      fields={fields}
      intent="rename-file"
      hiddenFields={{ id: shown?.id }}
      defaultValues={{ name: shown?.name ?? "" }}
      submitLabel={t("actions.rename")}
      contentClassName="sm:max-w-md"
    />
  );
}
