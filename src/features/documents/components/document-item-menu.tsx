import * as React from "react";
import {
  DownloadIcon,
  EyeIcon,
  FolderInputIcon,
  FolderOpenIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { previewKind } from "../types/documents";
import { itemName, type DocumentItem, type OnDocumentAction } from "./document-item";
import { FileMenuItemsContext } from "./file-menu-items";

type DocumentItemMenuProps = {
  item: DocumentItem;
  canManage: boolean;
  onAction: OnDocumentAction;
  /** Controlled, so a right-click on the row can open the same menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** The ⋯ menu of a folder or file: open/preview, download, rename, move, trash. */
export function DocumentItemMenu({ item, canManage, onAction, open, onOpenChange, className }: DocumentItemMenuProps) {
  const { t } = useTranslation("documents");
  const previewable = item.kind === "file" && previewKind(item.file.mimeType) !== "none";
  const extraItems = React.use(FileMenuItemsContext);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative z-[1] shrink-0", className)}
          aria-label={t("actions.menu", { name: itemName(item) })}
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {item.kind === "folder" ? (
          <DropdownMenuItem onSelect={() => onAction("open", item)}>
            <FolderOpenIcon />
            {t("actions.open")}
          </DropdownMenuItem>
        ) : (
          <>
            {previewable && (
              <DropdownMenuItem onSelect={() => onAction("open", item)}>
                <EyeIcon />
                {t("actions.preview")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onAction("download", item)}>
              <DownloadIcon />
              {t("actions.download")}
            </DropdownMenuItem>
            {extraItems?.(item.file)}
          </>
        )}
        {canManage && (
          <>
            <DropdownMenuItem onSelect={() => onAction("rename", item)}>
              <PencilIcon />
              {t("actions.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("move", item)}>
              <FolderInputIcon />
              {t("actions.move")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onAction("trash", item)}>
              <Trash2Icon />
              {t("actions.trash")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
