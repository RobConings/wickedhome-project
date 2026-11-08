import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { LinkedImagePicker } from "@/features/documents";

type Props = { projectId: string; coverFileId: string | null; canManage: boolean; reloadKey?: unknown;
  initialImages?: ComponentProps<typeof LinkedImagePicker>["initialImages"]; };

/** Owner-specific composition; the saved cover and existing images keep their identities. */
export function ProjectCoverChooser({ projectId, coverFileId, canManage, reloadKey, initialImages }: Props) {
  const { t } = useTranslation("projects");
  return <LinkedImagePicker entityType="project" entityId={projectId} selectedId={coverFileId} canManage={canManage} reloadKey={reloadKey} initialImages={initialImages}
    labels={{ empty: t("cover.empty"), clear: t("cover.clear"), use: (name) => t("cover.use", { name }), remove: (name) => t("cover.remove", { name }) }} />;
}
