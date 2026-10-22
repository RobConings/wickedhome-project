import * as React from "react";
import { CheckIcon, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { FormResult } from "@/lib/forms";
import { fetchLinkedFiles } from "../data/documents-requests";
import { documentContentUrl, type DocumentEntityType, type DocumentFile } from "../types/documents";

export type DocumentCoverChooserProps = {
  /** The record whose attached images are offered, e.g. `entityType="recipe" entityId={recipe.id}`. */
  entityType: DocumentEntityType;
  entityId: string;
  /** The i18n namespace with the `cover.empty/use/remove/clear` texts (the owning feature's). */
  namespace: string;
  coverFileId: string | null;
  canManage: boolean;
  /** Changes when attachments change, so the images reload. */
  reloadKey?: unknown;
  /** Seed data instead of fetching (stories). */
  initialImages?: Pick<DocumentFile, "id" | "name" | "mimeType">[];
};

/**
 * Pick one of the images attached to a record as its cover (shown on its tile and page). Posts
 * `{ intent: "cover", id, fileId }` to the current route's action; `fileId` is empty to remove the cover.
 */
export function DocumentCoverChooser({ entityType, entityId, namespace, coverFileId, canManage, reloadKey, initialImages }: DocumentCoverChooserProps) {
  const { t } = useTranslation(namespace);
  const fetcher = useFetcher<FormResult>();
  const [images, setImages] = React.useState<Pick<DocumentFile, "id" | "name" | "mimeType">[] | null>(initialImages ?? null);
  const pendingCover = fetcher.formData ? String(fetcher.formData.get("fileId") ?? "") || null : undefined;
  const current = pendingCover === undefined ? coverFileId : pendingCover;

  React.useEffect(() => {
    if (initialImages) return;
    let cancelled = false;
    fetchLinkedFiles({ entityType, entityId })
      .then((files) => !cancelled && setImages(files.filter((file) => file.mimeType.startsWith("image/"))))
      .catch(() => !cancelled && setImages([]));
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, reloadKey, initialImages]);

  if (images === null) return <Skeleton className="h-16 rounded-lg" />;
  if (images.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
        {t("cover.empty")}
      </p>
    );
  }

  const choose = (fileId: string | null) => void fetcher.submit({ intent: "cover", id: entityId, fileId: fileId ?? "" }, { method: "post" });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {images.map((image) => {
          const selected = current === image.id;
          return (
            <button
              key={image.id}
              type="button"
              disabled={!canManage || fetcher.state !== "idle"}
              onClick={() => choose(selected ? null : image.id)}
              aria-pressed={selected}
              aria-label={selected ? t("cover.remove", { name: image.name }) : t("cover.use", { name: image.name })}
              title={image.name}
              className={cn(
                "relative size-16 overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-primary" : "border-transparent",
              )}
            >
              <img src={documentContentUrl(image.id)} alt="" className="size-full object-cover" loading="lazy" />
              {selected && (
                <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="size-3" aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {canManage && current && (
        <Button variant="link" size="sm" className="self-start px-0" onClick={() => choose(null)}>
          {t("cover.clear")}
        </Button>
      )}
    </div>
  );
}
