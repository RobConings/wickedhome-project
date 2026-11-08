import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { ImageChoiceGrid, type ImageChoicesLabels } from "@/components/shared/image-choice-grid";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveEvents } from "@/lib/live-events";
import type { FormResult } from "@/lib/forms";
import { fetchLinkedFiles } from "../data/documents-requests";
import { documentContentUrl, type DocumentEntityType, type DocumentFile } from "../types/documents";

/** Documents supplies the images; the host's route action validates and saves its selected cover. */
export function LinkedImagePicker({ entityType, entityId, selectedId, canManage, reloadKey, initialImages, labels, intent = "cover" }: {
  entityType: DocumentEntityType; entityId: string; selectedId: string | null; canManage: boolean;
  reloadKey?: unknown; initialImages?: Pick<DocumentFile, "id" | "name" | "mimeType">[]; labels?: ImageChoicesLabels; intent?: string;
}) {
  const { t } = useTranslation("documents");
  const fetcher = useFetcher<FormResult>();
  const [version, setVersion] = useState(0);
  useLiveEvents("documents.changed", () => setVersion((value) => value + 1), { enabled: !initialImages });
  const [images, setImages] = useState(initialImages ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (initialImages) return;
    let active = true;
    fetchLinkedFiles({ entityType, entityId }).then((files) => { if (active) { setImages(files.filter((file) => file.mimeType.startsWith("image/"))); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [entityType, entityId, initialImages, reloadKey, version]);
  if (failed) return <InlineAlert tone="error">{t("images.loadError")}</InlineAlert>;
  if (!images) return <Skeleton className="h-20" />;
  const current = fetcher.formData ? String(fetcher.formData.get("fileId") ?? "") || null : selectedId;
  const copy = labels ?? { empty: t("images.empty"), clear: t("images.clear"), use: (name: string) => t("images.use", { name }), remove: (name: string) => t("images.remove", { name }) };
  return <>
    {fetcher.data && !fetcher.data.ok && <InlineAlert tone="error">{fetcher.data.formError ?? t("images.saveError")}</InlineAlert>}
    <ImageChoiceGrid images={images.map((image) => ({ ...image, url: documentContentUrl(image.id) }))} selectedId={current} disabled={!canManage || fetcher.state !== "idle"} labels={copy}
      onSelect={(fileId) => void fetcher.submit({ intent, id: entityId, fileId: fileId ?? "" }, { method: "post" })} />
  </>;
}
