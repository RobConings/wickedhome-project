import * as React from "react";
import { ChevronRightIcon, HardDriveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineAlert } from "./inline-alert";
import { cn } from "@/lib/utils";
import type { DocumentFolder } from "../types/documents";
import { itemId, itemName, type DocumentItem } from "./document-item";
import { FolderGlyph } from "./folder-glyph";
import { useDialogFetcher } from "./use-document-fetcher";

type MoveToFolderDialogProps = {
  /** What to move; `null` closes the dialog. */
  item: DocumentItem | null;
  /** Every folder of the drive (not in the trash); `undefined` while they are still loading. */
  folders: DocumentFolder[] | undefined;
  /** Loading the folders failed (and there are none to show): an error with `onRetry` replaces the tree. */
  foldersFailed?: boolean;
  onRetry?: () => void;
  onOpenChange: (open: boolean) => void;
};

type Node = { folder: DocumentFolder; children: Node[] };

function buildTree(folders: DocumentFolder[], excluded: string | null): Node[] {
  const byParent = new Map<string | null, DocumentFolder[]>();
  for (const folder of folders) {
    // A folder can't go into itself or anything below it: leave its whole branch out.
    if (folder.id === excluded) continue;
    byParent.set(folder.parentId, [...(byParent.get(folder.parentId) ?? []), folder]);
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const build = (parentId: string | null): Node[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((folder) => ({ folder, children: build(folder.id) }));
  return build(null);
}

function ancestorIds(folders: DocumentFolder[], folderId: string | null): Set<string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !result.has(current.id)) {
    result.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}

/** Pick a destination folder in a tree. The current location is marked and can't be chosen. */
export function MoveToFolderDialog({ item, folders, foldersFailed = false, onRetry, onOpenChange }: MoveToFolderDialogProps) {
  const { t } = useTranslation("documents");
  const { t: tCommon } = useTranslation();
  const open = item !== null;
  const { fetcher, submitting } = useDialogFetcher(`move-${item ? itemId(item) : "none"}`, open, () => {
    toast.success(t("moveForm.moved"));
    onOpenChange(false);
  });

  const currentParent = item ? (item.kind === "folder" ? item.folder.parentId : item.file.folderId) : null;
  const loaded = folders !== undefined;
  const [target, setTarget] = React.useState<string | null>(currentParent);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => ancestorIds(folders ?? [], currentParent));
  // Start over for another item, and open the tree to the current location once the folders arrive.
  const [shownFor, setShownFor] = React.useState({ item, loaded });
  if (shownFor.item !== item || shownFor.loaded !== loaded) {
    setShownFor({ item, loaded });
    if (shownFor.item !== item) setTarget(currentParent);
    setExpanded(ancestorIds(folders ?? [], currentParent));
  }

  const tree = buildTree(folders ?? [], item?.kind === "folder" ? item.folder.id : null);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderOption = (id: string | null, label: React.ReactNode, depth: number, node?: Node) => {
    const isCurrent = id === currentParent;
    const selected = id === target;
    const hasChildren = Boolean(node?.children.length);
    return (
      <div
        className={cn(
          "flex items-center gap-1 rounded-md pr-2 transition-colors",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        )}
        style={{ paddingLeft: `${depth * 1.25}rem` }}
      >
        {id && hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={expanded.has(id) ? t("moveForm.collapse") : t("moveForm.expand")}
            aria-expanded={expanded.has(id)}
            onClick={() => toggle(id)}
          >
            <ChevronRightIcon className={cn("transition-transform", expanded.has(id) && "rotate-90")} />
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5">
          <input
            type="radio"
            name="targetId"
            value={id ?? ""}
            checked={selected}
            onChange={() => setTarget(id)}
            className="sr-only"
          />
          {label}
          {isCurrent && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t("moveForm.current")}</span>}
        </label>
      </div>
    );
  };

  const renderNodes = (nodes: Node[], depth: number): React.ReactNode =>
    nodes.map((node) => (
      <li key={node.folder.id}>
        {renderOption(
          node.folder.id,
          <>
            <FolderGlyph color={node.folder.color} size="sm" />
            <span className="truncate">{node.folder.name}</span>
          </>,
          depth,
          node,
        )}
        {expanded.has(node.folder.id) && node.children.length > 0 && <ul>{renderNodes(node.children, depth + 1)}</ul>}
      </li>
    ));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Stay open until the move finished, so its outcome is seen.
        if (submitting && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {item && (
          <fetcher.Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="move" />
            <input type="hidden" name="kind" value={item.kind} />
            <input type="hidden" name="id" value={itemId(item)} />
            <DialogHeader>
              <DialogTitle>{t("moveForm.title", { name: itemName(item) })}</DialogTitle>
              <DialogDescription>{t("moveForm.description")}</DialogDescription>
            </DialogHeader>
            {!submitting && fetcher.data?.formError && <InlineAlert tone="error">{fetcher.data.formError}</InlineAlert>}
            {!loaded && foldersFailed ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {t("moveForm.loadFailed")}
                {onRetry && (
                  <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                    {tCommon("actions.retry")}
                  </Button>
                )}
              </div>
            ) : !loaded ? (
              <div className="flex flex-col rounded-lg border p-2" role="status" aria-label={t("loading.folders")}>
                {[45, 60, 35, 55, 40].map((width, index) => (
                  <div key={index} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: index === 0 ? 0 : "1.75rem" }}>
                    <Skeleton className="size-4 shrink-0 rounded" />
                    <Skeleton className="h-4" style={{ width: `${width}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <fieldset disabled={submitting} className="max-h-80 overflow-y-auto rounded-lg border p-1 text-sm">
                <legend className="sr-only">{t("moveForm.destination")}</legend>
                <ul>
                  <li>
                    {renderOption(
                      null,
                      <>
                        <HardDriveIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate font-medium">{t("page.title")}</span>
                      </>,
                      0,
                    )}
                    <ul>{renderNodes(tree, 1)}</ul>
                  </li>
                </ul>
              </fieldset>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                {tCommon("actions.cancel")}
              </Button>
              <Button type="submit" loading={submitting} disabled={!loaded || target === currentParent}>
                {submitting ? tCommon("form.saving") : t("moveForm.submit")}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
