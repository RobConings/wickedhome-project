import { Trash2Icon, Undo2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Inline } from "@/components/layout/inline";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { itemName, type DocumentItem } from "./document-item";
import { isTrashBusyFor, type TrashBusy } from "./trash-item";

export type TrashItemActionsProps = {
  item: DocumentItem;
  /** While set, every action is disabled; the item it is about shows a spinner on that button. */
  busy?: TrashBusy | null;
  onRestore: (item: DocumentItem) => void | Promise<unknown>;
  /** Return the submit's promise: the confirm dialog then stays open with a busy button until it is done. */
  onDelete: (item: DocumentItem) => void | Promise<unknown>;
  /** Delete as an icon button only (tiles); otherwise its label shows from `sm` up. */
  compact?: boolean;
  className?: string;
};

/** Restore, and delete forever (after a confirmation), for one trashed folder or file. */
export function TrashItemActions({ item, busy = null, onRestore, onDelete, compact = false, className }: TrashItemActionsProps) {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();
  const mine = isTrashBusyFor(busy, item);
  const name = itemName(item);

  return (
    <Inline gap="xs" className={className}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        loading={mine && busy?.intent === "restore"}
        onClick={() => void onRestore(item)}
      >
        <Undo2Icon />
        {t("actions.restore")}
      </Button>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            loading={mine && busy?.intent === "delete"}
            aria-label={t("actions.deleteForeverNamed", { name })}
          >
            <Trash2Icon />
            {!compact && <span className="hidden sm:inline">{t("actions.deleteForever")}</span>}
          </Button>
        }
        title={t("trash.deleteTitle", { name })}
        description={item.kind === "folder" ? t("trash.deleteFolderDescription") : t("trash.deleteDescription")}
        confirmLabel={t("actions.deleteForever")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        onConfirm={() => onDelete(item)}
      />
    </Inline>
  );
}
